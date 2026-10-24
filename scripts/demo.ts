import fs from "node:fs/promises";
import assert from "node:assert/strict";
import { Wallet, Contract, JsonRpcProvider, NonceManager, id } from "ethers";
import { deviceId, ACTIONS } from "../packages/shared/src/protocol.ts";
const env = JSON.parse(await fs.readFile(".local/runtime.json", "utf8"));
const keys = JSON.parse(await fs.readFile(".local/identities.json", "utf8"));
const deployment = JSON.parse(
  await fs.readFile("deployments/local.json", "utf8"),
);
const p = new JsonRpcProvider(env.RPC_URL, undefined, { cacheTimeout: -1 });
if (Number((await p.getNetwork()).chainId) !== 31337)
  throw Error("Démonstration strictement locale");
const owner = new NonceManager(new Wallet(keys.owner, p));
const guest = new NonceManager(new Wallet(keys.guest, p));
const home: any = new Contract(deployment.registry, deployment.abi, owner);
const lock = deviceId("LOCK-01");
const observations: any[] = [];
async function request(actor: any, which = lock, action = 1) {
  const block = await p.getBlock("latest");
  const receipt = await (
    await home
      .connect(actor)
      .requestCommand(
        which,
        action,
        Math.max(block!.timestamp, Math.floor(Date.now() / 1000)) + 120,
      )
  ).wait();
  const event = receipt.logs
    .map((l: any) => {
      try {
        return home.interface.parseLog(l);
      } catch {
        return null;
      }
    })
    .find((l: any) => l?.name === "CommandRequested");
  return {
    requestId: event.args.requestId,
    txHash: receipt.hash,
    gasUsed: String(receipt.gasUsed),
  };
}
await (
  await home.revokePermission(lock, new Wallet(keys.guest).address)
).wait();
await assert.rejects(() => request(guest));
guest.reset();
observations.push({ test: "invité sans droit", result: "refusé" });
const block = await p.getBlock("latest");
await (
  await home.grantPermission(
    lock,
    new Wallet(keys.guest).address,
    2,
    block!.timestamp + 300,
  )
).wait();
const requestInfo = await request(guest);
console.log("Demande locale confirmée :", requestInfo.requestId);
const gatewayFile = ".local/gateway.json";
const deadline = Date.now() + 45000;
let job: any;
while (Date.now() < deadline) {
  const s = JSON.parse(await fs.readFile(gatewayFile, "utf8"));
  job = s.jobs?.[requestInfo.requestId];
  if (job?.status === "exécutée") break;
  await new Promise((r) => setTimeout(r, 500));
}
assert.equal(job?.status, "exécutée");
assert.equal((await home.commands(requestInfo.requestId)).finalized, true);
observations.push({
  test: "transaction → indexeur → MQTT TLS → serrure → accusé signé → preuve sur chaîne",
  result: "réussi",
  ...requestInfo,
  ack: job.ack,
  resultTxHash: job.resultTxHash,
  resultBlock: job.resultBlock,
});
await (
  await home.revokePermission(lock, new Wallet(keys.guest).address)
).wait();
await assert.rejects(() => request(guest));
guest.reset();
observations.push({ test: "invité après révocation", result: "refusé" });
for (const [label, actions] of [
  ["PLUG-01", [2, 3]],
  ["CAM-01", [4, 5]],
] as const) {
  for (const action of actions) {
    const info = await request(owner, deviceId(label), action);
    let result: any;
    const until = Date.now() + 30000;
    while (Date.now() < until) {
      result = JSON.parse(await fs.readFile(gatewayFile, "utf8")).jobs?.[
        info.requestId
      ];
      if (result?.status === "exécutée") break;
      await new Promise((r) => setTimeout(r, 500));
    }
    assert.equal(result?.status, "exécutée");
    assert.equal(result.ack.state, ACTIONS[action]);
    assert.equal((await home.commands(info.requestId)).finalized, true);
    observations.push({
      test: label + " " + ACTIONS[action] + " via MQTT TLS",
      result: "réussi",
      ...info,
      ack: result.ack,
      resultTxHash: result.resultTxHash,
      resultBlock: result.resultBlock,
    });
  }
}
await fs.writeFile(
  "docs/preuve-parcours-local.json",
  JSON.stringify(
    {
      network: "Hardhat local 31337",
      executedAt: new Date().toISOString(),
      observations,
    },
    null,
    2,
  ),
);
console.log(
  "Parcours serrure, prise et caméra vérifiés ; preuve : docs/preuve-parcours-local.json",
);
