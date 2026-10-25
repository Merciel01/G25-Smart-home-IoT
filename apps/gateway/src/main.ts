import { Wallet, Contract } from "ethers";
import mqtt from "mqtt";
import {
  config,
  required,
  mqttOptions,
  relayer,
} from "../../../packages/shared/src/config.ts";
import { Store } from "../../../packages/shared/src/storage.ts";
import { Indexer } from "./indexer.ts";
import { createApp, processInstallations, handleStatus } from "./server.ts";
const c = config();
const store = new Store("gateway", process.env.DATABASE_URL);
await store.init();
await store.mutate((s) => {
  const binding = `${c.chainId}/${c.registry.toLowerCase()}`;
  if (s.binding && s.binding !== binding)
    throw Error(
      "État lié à un autre déploiement : restaurer ou réinitialiser explicitement",
    );
  s.binding = binding;
});
// Prevent multiple indexers/relayers racing on the same gateway scope.
const lock = store.pool ? await store.pool.connect() : null;
let active = !lock;
lock?.on("error", () => {
  // Losing this dedicated session also loses the advisory lock: fail closed.
  console.error("Connexion de coordination perdue ; arrêt de la passerelle.");
  process.exit(1);
});
const mqttClient = mqtt.connect(required("MQTT_URL"), {
  ...mqttOptions(),
  manualConnect: !!lock,
});
mqttClient.on("error", () => {});
const signer = new Wallet(required("GATEWAY_SIGNING_KEY"));
if (
  (await c.home.gatewaySigner()).toLowerCase() !== signer.address.toLowerCase()
)
  throw Error("Signer passerelle incorrect");
const writer = new Contract(
  c.registry,
  c.homeArtifact.abi,
  relayer(c.provider),
);
const indexer = new Indexer(c, store, mqttClient, signer, writer);
if (!active) indexer.lastError = "GATEWAY_STANDBY";
mqttClient.on("connect", () => {
  void mqttClient.subscribeAsync(
    [`${c.prefix}/+/acks`, `${c.prefix}/+/status`],
    { qos: 1 },
  );
});
mqttClient.on("message", (topic, buffer, packet) => {
  if (packet.retain) return;
  void (
    topic.endsWith("/acks")
      ? indexer.ack(topic, buffer).then(async () => {
          const a = JSON.parse(buffer.toString());
          await store.mutate((s) => {
            s.states ??= {};
            if (a.deviceNonce <= (s.states[a.deviceId]?.deviceNonce ?? 0))
              return;
            s.states[a.deviceId] = {
              ...s.states[a.deviceId],
              state: a.state,
              deviceNonce: a.deviceNonce,
              lastSeen:
                Date.now() / 1000 - a.executedAt < 30
                  ? Date.now()
                  : (s.states[a.deviceId]?.lastSeen ?? null),
            };
          });
        })
      : handleStatus(c, store, topic, buffer)
  ).catch(() => {
    console.warn("Message MQTT refusé");
  });
});
let pending = false;
const interval = setInterval(async () => {
  if (pending) return;
  pending = true;
  try {
    if (!active && lock) {
      active = (
        await lock.query(
          "SELECT pg_try_advisory_lock(hashtext('g25-gateway')) AS acquired",
        )
      ).rows[0].acquired;
      if (!active) return;
      mqttClient.connect();
      console.log("Coordination acquise ; traitement MQTT activé.");
    }
    if (lock) await lock.query("SELECT 1");
    await indexer.tick();
    await processInstallations(c, store, mqttClient);
  } catch {
  } finally {
    pending = false;
  }
}, 1000);
const app = createApp(c, store, mqttClient, indexer);
const server = app.listen(
  Number(process.env.PORT ?? 3001),
  c.local ? "127.0.0.1" : "0.0.0.0",
  () => console.log("Passerelle HTTP prête"),
);
async function stop() {
  indexer.stopped = true;
  clearInterval(interval);
  server.close();
  await mqttClient.endAsync();
  if (lock) {
    if (active)
      await lock.query("SELECT pg_advisory_unlock(hashtext('g25-gateway'))");
    lock.release();
  }
  await store.close();
  process.exit(0);
}
process.on("SIGTERM", stop);
process.on("SIGINT", stop);
