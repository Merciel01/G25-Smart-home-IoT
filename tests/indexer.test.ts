import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { Wallet, id } from "ethers";
import { Store } from "../packages/shared/src/storage.ts";
import { Indexer } from "../apps/gateway/src/indexer.ts";
test("indexeur : reprise du curseur, révocation avant envoi et panne MQTT/RPC", async () => {
  const directory = await fs.mkdtemp("/tmp/g25-indexer-");
  const store = new Store("gateway", undefined, directory);
  await store.init();
  const requestId = id("queued");
  const job = {
    requestId,
    deviceId: id("LOCK"),
    requester: Wallet.createRandom().address,
    action: 1,
    revision: 0,
    deadline: Math.floor(Date.now() / 1000) + 120,
    status: "confirmée",
    attempts: 0,
  };
  await store.mutate((s) => {
    s.cursor = { number: 10, hash: "0xabc" };
    s.jobs = { [requestId]: job };
  });
  let executable = false;
  let publishes = 0;
  const c: any = {
    chainId: 31337,
    registry: Wallet.createRandom().address,
    block: 1,
    prefix: "g25/home01",
    confirmations: 1,
    provider: {
      getNetwork: async () => ({ chainId: 31337 }),
      getBlockNumber: async () => 10,
      getBlock: async () => ({ hash: "0xabc" }),
    },
    home: { isCommandExecutable: async () => executable },
  };
  const mqtt: any = {
    connected: true,
    publishAsync: async () => {
      publishes++;
    },
  };
  let indexer = new Indexer(
    c,
    store,
    mqtt,
    new Wallet(Wallet.createRandom().privateKey),
    {},
  );
  await indexer.tick();
  assert.equal(publishes, 0);
  assert.equal((await store.read()).jobs[requestId].status, "refusée");
  await store.mutate((s) => {
    s.jobs[requestId] = job;
  });
  executable = true;
  mqtt.connected = false;
  await indexer.tick();
  assert.equal(publishes, 0);
  mqtt.connected = true;
  indexer = new Indexer(
    c,
    new Store("gateway", undefined, directory),
    mqtt,
    new Wallet(Wallet.createRandom().privateKey),
    {},
  );
  await indexer.tick();
  assert.equal(publishes, 1);
  await indexer.tick();
  assert.equal(publishes, 1);
  assert.equal((await store.read()).cursor.number, 10);
  c.provider.getBlockNumber = async () => {
    throw Error("RPC_UNAVAILABLE");
  };
  await indexer.tick();
  assert.equal(publishes, 1);
  assert.equal(indexer.lastError, "DEPENDENCY_UNAVAILABLE");
  await fs.rm(directory, { recursive: true });
});
test("réorganisation : réindexation sûre et aucun relayage sensible", async () => {
  const directory = await fs.mkdtemp("/tmp/g25-reorg-");
  const store = new Store("gateway", undefined, directory);
  await store.init();
  await store.mutate((s) => {
    s.cursor = { number: 10, hash: "old" };
    s.jobs = {
      orphan: { requestId: "orphan", status: "exécutée", txHash: "0xorphan" },
    };
  });
  const c: any = {
    block: 1,
    chainId: 31337,
    confirmations: 1,
    provider: {
      getNetwork: async () => ({ chainId: 31337 }),
      getBlockNumber: async () => 11,
      getBlock: async () => ({ hash: "replaced" }),
      getLogs: async () => [],
    },
  };
  const i = new Indexer(
    c,
    store,
    {
      connected: true,
      publishAsync: () => {
        throw Error("Ne doit jamais publier");
      },
    } as any,
    new Wallet(Wallet.createRandom().privateKey),
    {},
  );
  await i.tick();
  assert.ok((await store.read()).rebuilding);
  assert.equal(i.lastError, "CHAIN_REORG");
  await i.tick();
  const rebuilt = await store.read();
  assert.equal(rebuilt.rebuilding, false);
  assert.equal(rebuilt.cursor.number, 11);
  assert.equal(rebuilt.orphanedJobs.orphan.status, "exécutée");
  await fs.rm(directory, { recursive: true });
});
