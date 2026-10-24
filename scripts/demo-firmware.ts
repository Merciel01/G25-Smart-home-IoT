import fs from "node:fs/promises";
import assert from "node:assert/strict";
import {
  Wallet,
  NonceManager,
  JsonRpcProvider,
  Contract,
  hexlify,
  randomBytes,
  id,
} from "ethers";
import {
  deviceId,
  firmwareDomain,
  homeDomain,
  manifestTypes,
  installTypes,
} from "../packages/shared/src/protocol.ts";
const env = JSON.parse(await fs.readFile(".local/runtime.json", "utf8"));
const keys = JSON.parse(await fs.readFile(".local/identities.json", "utf8"));
const d = JSON.parse(await fs.readFile("deployments/local.json", "utf8"));
const p = new JsonRpcProvider(env.RPC_URL, undefined, { cacheTimeout: -1 });
assert.equal(Number((await p.getNetwork()).chainId), 31337);
const manufacturer = new Wallet(keys.manufacturer, p),
  owner = new Wallet(keys.owner, p),
  guest = new Wallet(keys.guest, p);
const fw: any = new Contract(
  d.firmwareRegistry,
  d.firmwareAbi,
  new NonceManager(manufacturer),
);
const origin = "http://127.0.0.1:5173";
async function api(path: string, token = "", body?: any) {
  return fetch(env.API_BASE_URL + path, {
    method: body ? "POST" : "GET",
    headers: {
      Origin: origin,
      "Content-Type": "application/json",
      ...(token ? { Authorization: "Bearer " + token } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
}
async function login(wallet: Wallet) {
  const challenge: any = await (
    await api("/auth/challenge", "", { address: wallet.address })
  ).json();
  const result = await api("/auth/verify", "", {
    message: challenge.message,
    signature: await wallet.signMessage(challenge.message),
  });
  assert.equal(result.status, 200);
  return ((await result.json()) as any).token;
}
const ownerToken = await login(owner),
  manufacturerToken = await login(manufacturer),
  guestToken = await login(guest);
const model = id("G25-LOCK");
const base = Math.max(10000, Number(await fw.latestVersion(model)) + 100);
const proofs: any[] = [];
async function publish(file: string, version: number) {
  const bytes = await fs.readFile(file);
  const response = await api("/firmware/upload", manufacturerToken, {
    modelId: model,
    bytes: bytes.toString("base64"),
  });
  assert.equal(response.status, 200);
  const upload: any = await response.json();
  const manifest = {
    modelId: model,
    version,
    sha256Digest: upload.sha256Digest,
    cidHash: upload.cidHash,
    fileSize: upload.fileSize,
    manufacturer: manufacturer.address,
  };
  const signature = await manufacturer.signTypedData(
    firmwareDomain(31337, d.firmwareRegistry),
    manifestTypes,
    manifest,
  );
  const receipt = await (
    await fw.publishFirmware(manifest, upload.cid, signature)
  ).wait();
  return { ...upload, txHash: receipt.hash, gasUsed: String(receipt.gasUsed) };
}
async function authorization(version: number, signer = owner) {
  const i = {
    deviceId: deviceId("LOCK-01"),
    version,
    nonce: hexlify(randomBytes(32)),
    expiresAt: Math.floor(Date.now() / 1000) + 120,
  };
  return {
    ...i,
    signature: await signer.signTypedData(
      homeDomain(31337, d.registry),
      installTypes,
      i,
    ),
  };
}
async function install(version: number) {
  const i = await authorization(version);
  const response = await api("/firmware/install", ownerToken, i);
  assert.equal(response.status, 202);
  let record: any;
  const until = Date.now() + 25000;
  while (Date.now() < until) {
    const s = JSON.parse(await fs.readFile(".local/gateway.json", "utf8"));
    record = s.installations?.[i.nonce];
    if (record?.status !== "en attente") break;
    await new Promise((r) => setTimeout(r, 500));
  }
  return { authorization: i, record };
}
const first = await publish("firmware/G25-LOCK-1.0.0.bin", base);
const good = await install(base);
assert.equal(good.record.status, "installée");
proofs.push({
  test: "mise à jour saine via MQTT TLS",
  version: base,
  status: good.record.status,
  publication: first,
  result: good.record.result,
});
const denied = await api(
  "/firmware/install",
  guestToken,
  await authorization(base + 1, guest),
);
assert.equal(denied.status, 403);
proofs.push({ test: "installation par invité", httpStatus: denied.status });
const replay = await api("/firmware/install", ownerToken, good.authorization);
assert.equal(replay.status, 400);
proofs.push({ test: "rejeu autorisation", httpStatus: replay.status });
const next = await publish("firmware/G25-LOCK-1.1.0.bin", base + 100);
const file = ".local/ipfs/" + next.cid;
const original = await fs.readFile(file);
try {
  await fs.writeFile(file, await fs.readFile("firmware/altered.bin"));
  const bad = await install(base + 100);
  assert.equal(bad.record.status, "refusée : HASH_MISMATCH");
  const sim = JSON.parse(await fs.readFile(".local/simulator.json", "utf8"));
  assert.equal(sim.devices[deviceId("LOCK-01")].version, base);
  proofs.push({
    test: "fichier altéré",
    status: bad.record.status,
    previousVersionPreserved: base,
    result: bad.record.result,
  });
} finally {
  await fs.writeFile(file, original);
}
const second = await install(base + 100);
assert.equal(second.record.status, "installée");
proofs.push({
  test: "mise à jour après restauration du fichier sain",
  status: second.record.status,
  result: second.record.result,
});
const rollback = await install(base);
assert.equal(rollback.record.status, "refusée : ROLLBACK_BLOCKED");
proofs.push({
  test: "retour à une ancienne version",
  status: rollback.record.status,
  result: rollback.record.result,
});
await fs.writeFile(
  "docs/preuve-micrologiciels-local.json",
  JSON.stringify(
    {
      network: "Hardhat local 31337",
      executedAt: new Date().toISOString(),
      proofs,
    },
    null,
    2,
  ),
);
console.log(
  "Micrologiciels : installation saine, refus invité/rejeu/hash/rollback vérifiés ; preuves dans docs/preuve-micrologiciels-local.json",
);
