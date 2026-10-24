import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { Wallet, id, sha256, toUtf8Bytes } from "ethers";
import { Store } from "../packages/shared/src/storage.ts";
import { handleStatus } from "../apps/gateway/src/server.ts";
import { Engine } from "../apps/simulator/src/engine.ts";
import {
  homeDomain,
  commandTypes,
  manifestTypes,
  firmwareDomain,
  cidHash,
  installTypes,
  statusTypes,
  stateHash,
} from "../packages/shared/src/protocol.ts";
const device = new Wallet(Wallet.createRandom().privateKey),
  gateway = Wallet.createRandom(),
  owner = Wallet.createRandom(),
  manufacturer = Wallet.createRandom();
const did = id("LOCK-INTEGRATION"),
  registry = Wallet.createRandom().address,
  firmware = Wallet.createRandom().address;
const requestRecords = new Map<string, any>();
let permission = true,
  revoked = false,
  authorized = true;
const bytes = Buffer.from("G25 firmware inerte 1.1.0");
const cid = "bafkreiaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
async function setup() {
  const directory = await fs.mkdtemp("/tmp/g25-engine-");
  const store = new Store("simulator", undefined, directory);
  await store.init();
  const model = id("G25-LOCK");
  const manifest = {
    modelId: model,
    version: 10100,
    sha256Digest: sha256(bytes),
    cidHash: cidHash(cid),
    fileSize: bytes.length,
    manufacturer: manufacturer.address,
  };
  const signature = await manufacturer.signTypedData(
    firmwareDomain(31337, firmware),
    manifestTypes,
    manifest,
  );
  const home = {
    commands: async (id: string) => requestRecords.get(id),
    isCommandExecutable: async () => permission,
    getDevice: async () => ({
      deviceSigner: device.address,
      owner: owner.address,
      modelId: model,
      revoked,
    }),
    allowedMask: async () => 3,
  };
  const fw = {
    getFirmware: async () => ({ manifest, cid, signature }),
    isManufacturerAuthorized: async () => authorized,
  };
  const engine = new Engine(
    store,
    31337,
    registry,
    gateway.address,
    new Map([[did, device]]),
    async () => permission,
    home,
    fw,
    firmware,
    "https://ipfs.invalid/ipfs",
  );
  return { store, engine, home, fw, manifest, directory };
}
async function envelope() {
  const value = {
    protocolVersion: 1,
    chainId: 31337,
    registry,
    requestId: id(Wallet.createRandom().address),
    deviceId: did,
    action: 1,
    requester: owner.address,
    permissionRevision: 0,
    issuedAt: Math.floor(Date.now() / 1000),
    expiresAt: Math.floor(Date.now() / 1000) + 120,
  };
  requestRecords.set(value.requestId, {
    deviceId: value.deviceId,
    action: value.action,
    requester: value.requester,
    revision: value.permissionRevision,
    deadline: value.expiresAt,
  });
  return {
    ...value,
    signature: await gateway.signTypedData(
      homeDomain(31337, registry),
      commandTypes,
      value,
    ),
  };
}
test("commande MQTT signée, déduplication et reprise après redémarrage", async () => {
  const { store, engine, directory } = await setup();
  const e = await envelope();
  const a = await engine.command(did, e);
  assert.equal(a.state, "UNLOCK");
  assert.deepEqual(await engine.command(did, e), a);
  const restarted = new Store("simulator", undefined, directory);
  assert.equal((await restarted.read()).devices[did].executions, 1);
  engine.store = restarted;
  assert.deepEqual(await engine.command(did, e), a);
  assert.equal((await restarted.read()).devices[did].executions, 1);
  const gatewayStore = new Store("gateway", undefined, directory);
  await gatewayStore.init();
  const observedAt = Math.floor(Date.now() / 1000);
  await gatewayStore.mutate((s) => {
    s.states = {
      [did]: {
        deviceNonce: 9,
        observedAt: observedAt - 1,
        state: "LOCK",
        version: 10100,
      },
    };
  });
  const stale = {
    deviceId: did,
    deviceNonce: 8,
    stateHash: stateHash("UNLOCK"),
    version: 10000,
    observedAt,
  };
  const signature = await device.signTypedData(
    homeDomain(31337, registry),
    statusTypes,
    stale,
  );
  await handleStatus(
    {
      chainId: 31337,
      registry,
      prefix: "g25/home01",
      home: engine.home,
    } as any,
    gatewayStore,
    `g25/home01/${did}/status`,
    Buffer.from(
      JSON.stringify({
        kind: "heartbeat",
        ...stale,
        state: "UNLOCK",
        signature,
      }),
    ),
  );
  assert.equal((await gatewayStore.read()).states[did].state, "LOCK");
  assert.equal((await gatewayStore.read()).states[did].version, 10100);
  await fs.rm(directory, { recursive: true });
});
test("faux signer, mauvais sujet/destinataire, expiration et révocation en file", async () => {
  const { engine, directory } = await setup();
  const e = await envelope();
  await assert.rejects(() => engine.command(id("wrong"), e));
  await assert.rejects(() => engine.command(did, { ...e, action: 0 }));
  await assert.rejects(() =>
    engine.command(did, { ...e, registry: Wallet.createRandom().address }),
  );
  const expired = { ...e, issuedAt: 1, expiresAt: 2 };
  expired.signature = await gateway.signTypedData(
    homeDomain(31337, registry),
    commandTypes,
    expired,
  );
  await assert.rejects(() => engine.command(did, expired), /COMMAND_EXPIRED/);
  permission = false;
  await assert.rejects(() => engine.command(did, e), /PERMISSION_DENIED/);
  permission = true;
  await fs.rm(directory, { recursive: true });
});
test("RPC indisponible : refus fermé, aucune exécution", async () => {
  const { engine, store, directory } = await setup();
  engine.executable = async () => {
    throw Error("RPC_UNAVAILABLE");
  };
  const e = await envelope();
  await assert.rejects(() => engine.command(did, e), /RPC_UNAVAILABLE/);
  assert.equal((await store.read()).devices?.[did], undefined);
  await fs.rm(directory, { recursive: true });
});
test("micrologiciel sain, résultat signé, version persistée et anti-rollback", async () => {
  const { engine, store, directory } = await setup();
  const original = globalThis.fetch;
  globalThis.fetch = async () => new Response(bytes);
  try {
    const i = {
      deviceId: did,
      version: 10100,
      nonce: id("install-valid"),
      expiresAt: Math.floor(Date.now() / 1000) + 120,
    };
    const authorization = {
      ...i,
      signature: await owner.signTypedData(
        homeDomain(31337, registry),
        installTypes,
        i,
      ),
    };
    const result = await engine.install(did, authorization);
    assert.equal(result.version, 10100);
    assert.equal((await store.read()).devices[did].version, 10100);
    assert.deepEqual(await engine.install(did, authorization), result);
    const rollback = { ...i, nonce: id("rollback") };
    const rollbackSignature = await owner.signTypedData(
      homeDomain(31337, registry),
      installTypes,
      rollback,
    );
    await assert.rejects(
      () => engine.install(did, { ...rollback, signature: rollbackSignature }),
      /ROLLBACK_BLOCKED/,
    );
  } finally {
    globalThis.fetch = original;
    await fs.rm(directory, { recursive: true });
  }
});
test("installation : hash, signature, modèle, fabricant révoqué, indisponibilité, taille et invité", async () => {
  const original = globalThis.fetch;
  try {
    for (const kind of [
      "hash",
      "signature",
      "model",
      "manufacturer",
      "unavailable",
      "size",
      "guest",
      "revoked",
    ]) {
      const { engine, store, fw, manifest, directory } = await setup();
      const i = {
        deviceId: did,
        version: 10100,
        nonce: id(kind),
        expiresAt: Math.floor(Date.now() / 1000) + 120,
      };
      const signed = await (kind === "guest" ? gateway : owner).signTypedData(
        homeDomain(31337, registry),
        installTypes,
        i,
      );
      globalThis.fetch = async () =>
        kind === "unavailable"
          ? new Response(null, { status: 503 })
          : new Response(
              kind === "hash"
                ? Buffer.from("altéré")
                : kind === "size"
                  ? Buffer.alloc(1048577)
                  : bytes,
            );
      if (kind === "signature")
        fw.getFirmware = async () => ({
          manifest,
          cid,
          signature: "0x" + "00".repeat(65),
        });
      if (kind === "model")
        fw.getFirmware = async () => ({
          manifest: { ...manifest, modelId: id("G25-CAM") },
          cid,
          signature: "0x" + "00".repeat(65),
        });
      authorized = kind !== "manufacturer";
      revoked = kind === "revoked";
      await assert.rejects(
        () => engine.install(did, { ...i, signature: signed }),
        kind,
      );
      assert.equal(
        (await store.read()).devices?.[did]?.version,
        undefined,
        kind,
      );
      authorized = true;
      revoked = false;
      await fs.rm(directory, { recursive: true });
    }
  } finally {
    globalThis.fetch = original;
    authorized = true;
    revoked = false;
  }
});

test("fixtures publiques : signatures, empreintes, modèle et version", async () => {
  const f = JSON.parse(await fs.readFile("firmware/fixtures.json", "utf8"));
  const { signedBy } = await import("../packages/shared/src/protocol.ts");
  for (const name of [
    "healthy-1.0.0",
    "healthy-1.1.0",
    "wrong-model",
    "old-version",
  ]) {
    const v = f.cases[name];
    assert.equal(
      signedBy(
        f.domain,
        manifestTypes,
        v.manifest,
        v.signature,
        f.expectedManufacturer,
      ),
      true,
    );
  }
  const bad = f.cases["invalid-signature"];
  assert.equal(
    signedBy(
      f.domain,
      manifestTypes,
      bad.manifest,
      bad.signature,
      f.expectedManufacturer,
    ),
    false,
  );
  const altered = f.cases["tampered-file"];
  assert.notEqual(
    sha256(await fs.readFile("firmware/" + altered.file)),
    altered.manifest.sha256Digest,
  );
  assert.notEqual(f.cases["wrong-model"].manifest.modelId, id("G25-LOCK"));
  assert.ok(
    f.cases["old-version"].manifest.version <
      f.cases["healthy-1.0.0"].manifest.version,
  );
});

test("horloge chaîne en avance : aucun effet avant un horodatage cohérent", async () => {
  permission = true;
  revoked = false;
  const { store, engine, home } = await setup();
  const original = home.getDevice;
  let future = true;
  home.getDevice = async () => ({
    ...(await original()),
    registeredAt: Math.floor(Date.now() / 1000) + (future ? 5 : -1),
  });
  const e = await envelope();
  await assert.rejects(engine.command(did, e), /CHAIN_CLOCK_AHEAD/);
  assert.equal((await store.read()).devices?.[did], undefined);
  assert.equal((await store.read()).acks?.[e.requestId], undefined);
  future = false;
  const ack = await engine.command(did, e);
  assert.equal(ack.state, "UNLOCK");
  assert.equal((await store.read()).devices[did].executions, 1);
});
