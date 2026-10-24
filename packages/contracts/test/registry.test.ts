import { test, before } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import {
  Wallet,
  NonceManager,
  JsonRpcProvider,
  ContractFactory,
  id,
  ZeroAddress,
  ZeroHash,
  sha256,
  toUtf8Bytes,
} from "ethers";
import {
  ackTypes,
  homeDomain,
  manifestTypes,
  firmwareDomain,
  cidHash,
} from "../../shared/src/protocol.ts";
const p = new JsonRpcProvider(
  process.env.TEST_RPC_URL ?? "http://127.0.0.1:8545",
  undefined,
  { cacheTimeout: -1 },
);
let admin: any,
  owner: any,
  guest: any,
  device: any,
  gateway: any,
  manufacturer: any,
  home: any,
  fw: any;
const lock = id("LOCK-TEST"),
  model = id("G25-LOCK");
const wallets = Array.from({ length: 6 }, () => Wallet.createRandom());
before(async () => {
  assert.equal(Number((await p.getNetwork()).chainId), 31337);
  for (const w of wallets)
    await p.send("hardhat_setBalance", [w.address, "0x3635c9adc5dea00000"]);
  [admin, owner, guest] = wallets
    .slice(0, 3)
    .map((w) => new NonceManager(w.connect(p)));
  device = wallets[3];
  gateway = wallets[4];
  manufacturer = wallets[5];
  for (const name of ["SmartHomeRegistry", "FirmwareRegistry"]) {
    const a = JSON.parse(
      await fs.readFile("artifacts/" + name + ".json", "utf8"),
    );
    const c = await new ContractFactory(a.abi, a.bytecode, admin).deploy(
      name === "SmartHomeRegistry" ? gateway.address : wallets[0].address,
    );
    await c.waitForDeployment();
    if (name === "SmartHomeRegistry") home = c;
    else fw = c;
  }
});
const fail = async (f: () => Promise<any>) => {
  await assert.rejects(async () => {
    const t = await f();
    if (t?.wait) await t.wait();
  });
  owner.reset();
  guest.reset();
  admin.reset();
};
const now = async () => Number((await p.getBlock("latest"))!.timestamp);
async function request(w: any, action = 1) {
  const r = await (
    await home.connect(w).requestCommand(lock, action, (await now()) + 120)
  ).wait();
  const log = r.logs
    .map((l: any) => {
      try {
        return home.interface.parseLog(l);
      } catch {
        return null;
      }
    })
    .find((l: any) => l?.name === "CommandRequested");
  return log.args.requestId;
}
test("identités : doublons, signers, modèles et propriété", async () => {
  await fail(() =>
    home.connect(owner).registerDevice(ZeroHash, device.address, model),
  );
  await fail(() =>
    home.connect(owner).registerDevice(lock, ZeroAddress, model),
  );
  await fail(() =>
    home.connect(owner).registerDevice(lock, wallets[1].address, model),
  );
  await fail(() =>
    home.connect(owner).registerDevice(lock, gateway.address, model),
  );
  await fail(() =>
    home.connect(owner).registerDevice(lock, device.address, id("invalide")),
  );
  await (
    await home.connect(owner).registerDevice(lock, device.address, model)
  ).wait();
  assert.equal((await home.getDevice(lock)).owner, wallets[1].address);
  await fail(() =>
    home
      .connect(owner)
      .registerDevice(lock, Wallet.createRandom().address, model),
  );
  await fail(() =>
    home.connect(owner).registerDevice(id("autre"), device.address, model),
  );
});
test("permissions par action, remplacement, expiration et rôles", async () => {
  await fail(() =>
    home
      .connect(guest)
      .grantPermission(
        lock,
        wallets[2].address,
        2,
        ((Date.now() / 1000) | 0) + 1000,
      ),
  );
  await fail(() =>
    home.connect(guest).revokePermission(lock, wallets[2].address),
  );
  await fail(() => home.connect(guest).revokeDevice(lock));
  await fail(() =>
    home
      .connect(owner)
      .grantPermission(
        lock,
        wallets[2].address,
        4,
        ((Date.now() / 1000) | 0) + 1000,
      ),
  );
  await fail(() =>
    home.connect(owner).grantPermission(lock, wallets[2].address, 2, 1),
  );
  assert.equal(await home.hasPermission(lock, wallets[2].address, 1), false);
  await fail(() => request(guest));
  await (
    await home
      .connect(owner)
      .grantPermission(lock, wallets[2].address, 2, (await now()) + 300)
  ).wait();
  assert.equal(await home.hasPermission(lock, wallets[2].address, 1), true);
  assert.equal(await home.hasPermission(lock, wallets[2].address, 0), false);
  assert.equal(
    await home.hasPermission(id("other"), wallets[2].address, 1),
    false,
  );
  await (
    await home
      .connect(owner)
      .grantPermission(lock, wallets[2].address, 1, (await now()) + 300)
  ).wait();
  assert.equal(await home.hasPermission(lock, wallets[2].address, 1), false);
});
test("révocation puis nouvel accès ne ressuscite pas une demande", async () => {
  await (
    await home
      .connect(owner)
      .grantPermission(lock, wallets[2].address, 2, (await now()) + 300)
  ).wait();
  const req = await request(guest);
  assert.equal(await home.isCommandExecutable(req), true);
  await (
    await home.connect(owner).revokePermission(lock, wallets[2].address)
  ).wait();
  assert.equal(await home.isCommandExecutable(req), false);
  await (
    await home
      .connect(owner)
      .grantPermission(lock, wallets[2].address, 2, (await now()) + 300)
  ).wait();
  assert.equal(await home.isCommandExecutable(req), false);
});
test("nonce unique, action incompatible et deadline bornée", async () => {
  assert.notEqual(await request(owner), await request(owner));
  await fail(() =>
    home
      .connect(owner)
      .requestCommand(lock, 5, ((Date.now() / 1000) | 0) + 100),
  );
  await fail(() => home.connect(owner).requestCommand(lock, 1, 1));
  await fail(() =>
    home
      .connect(owner)
      .requestCommand(lock, 1, ((Date.now() / 1000) | 0) + 999999),
  );
});
test("accusé : signature, domaine, correspondance et double finalisation", async () => {
  const req = await request(owner);
  const a = {
    requestId: req,
    deviceId: lock,
    action: 1,
    outcome: 1,
    stateHash: sha256(toUtf8Bytes("UNLOCK")),
    executedAt: await now(),
    deviceNonce: 1,
  };
  const domain = homeDomain(31337, await home.getAddress());
  await fail(() =>
    home.recordCommandResult(
      a,
      manufacturer.signTypedData(domain, ackTypes, a),
    ),
  );
  const wrong = await device.signTypedData(
    { ...domain, chainId: 11155111 },
    ackTypes,
    a,
  );
  await fail(() => home.recordCommandResult(a, wrong));
  const sig = await device.signTypedData(domain, ackTypes, a);
  await fail(() => home.recordCommandResult({ ...a, action: 0 }, sig));
  await fail(() =>
    home.recordCommandResult({ ...a, deviceId: id("wrong") }, sig),
  );
  await fail(() =>
    home.recordCommandResult({ ...a, requestId: id("wrong") }, sig),
  );
  await (await home.recordCommandResult(a, sig)).wait();
  assert.equal((await home.commands(req)).finalized, true);
  await fail(() => home.recordCommandResult(a, sig));
});
test("fabricant : bootstrap administrateur, publication monotone et révocation", async () => {
  const cid = "bafkreiaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
  const m = {
    modelId: model,
    version: 10000,
    sha256Digest: sha256(toUtf8Bytes("firmware")),
    cidHash: cidHash(cid),
    fileSize: 8,
    manufacturer: manufacturer.address,
  };
  const domain = firmwareDomain(31337, await fw.getAddress());
  const sig = await manufacturer.signTypedData(domain, manifestTypes, m);
  await fail(() =>
    fw.connect(guest).authorizeManufacturer(model, manufacturer.address),
  );
  await fail(() => fw.publishFirmware(m, cid, sig));
  await (await fw.authorizeManufacturer(model, manufacturer.address)).wait();
  await fail(() => fw.publishFirmware({ ...m, fileSize: 9 }, cid, sig));
  await (await fw.publishFirmware(m, cid, sig)).wait();
  await fail(() => fw.publishFirmware(m, cid, sig));
  await (await fw.revokeManufacturer(model, manufacturer.address)).wait();
  const next = { ...m, version: 10100 };
  await fail(() =>
    fw.publishFirmware(
      next,
      cid,
      manufacturer.signTypedData(domain, manifestTypes, next),
    ),
  );
});
test("expiration à la borne exacte et révocation permanente", async () => {
  const expires = (await now()) + 20;
  await (
    await home
      .connect(owner)
      .grantPermission(lock, wallets[2].address, 2, expires)
  ).wait();
  await p.send("evm_setNextBlockTimestamp", [expires]);
  await p.send("evm_mine", []);
  assert.equal(await home.hasPermission(lock, wallets[2].address, 1), false);
  await (await home.connect(owner).revokeDevice(lock)).wait();
  await fail(() => request(owner));
  await fail(() =>
    home
      .connect(owner)
      .grantPermission(lock, wallets[2].address, 2, expires + 1000),
  );
  assert.equal(await home.hasPermission(lock, wallets[1].address, 1), false);
});
