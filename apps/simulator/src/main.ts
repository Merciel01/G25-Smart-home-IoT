import mqtt from "mqtt";
import http from "node:http";
import { Wallet } from "ethers";
import {
  config,
  required,
  mqttOptions,
} from "../../../packages/shared/src/config.ts";
import { Store } from "../../../packages/shared/src/storage.ts";
import { Engine } from "./engine.ts";
import {
  homeDomain,
  statusTypes,
  stateHash,
  installFailureTypes,
} from "../../../packages/shared/src/protocol.ts";
import { provisioned } from "../../../packages/shared/src/provisioning.ts";
const c = config();
const store = new Store("simulator", process.env.DATABASE_URL);
await store.init();
await store.mutate((s) => {
  const binding = `${c.chainId}/${c.registry.toLowerCase()}`;
  if (s.binding && s.binding !== binding)
    throw Error(
      "État lié à un autre déploiement : restaurer ou réinitialiser explicitement",
    );
  s.binding = binding;
});
if (
  (await c.home.gatewaySigner()).toLowerCase() !==
  required("GATEWAY_SIGNER_ADDRESS").toLowerCase()
)
  throw Error("Identité de passerelle incorrecte");
const keys = JSON.parse(required("DEVICE_KEYS_JSON"));
const signers = new Map<string, Wallet>(
  Object.entries(keys).map(([id, key]) => [id, new Wallet(String(key))]),
);
const engine = new Engine(
  store,
  c.chainId,
  c.registry,
  required("GATEWAY_SIGNER_ADDRESS"),
  signers,
  async (id) => {
    const r = await fetch(
      required("API_BASE_URL") + "/internal/executable/" + id,
      { signal: AbortSignal.timeout(5000) },
    );
    return r.ok && ((await r.json()) as any).executable === true;
  },
  c.home,
  c.fw,
  c.firmware,
  required("IPFS_GATEWAY_URL"),
);
function connectDevice(
  id: string,
  credentials: { username: string; password: string },
) {
  const client = mqtt.connect(required("MQTT_URL"), {
    ...mqttOptions(credentials),
    clientId: "g25-device-" + id.slice(2, 14),
  });
  client.on("connect", () => {
    void client.subscribeAsync(`${c.prefix}/${id}/commands`, { qos: 1 });
  });
  client.on("error", () => {});
  let queue = Promise.resolve();
  client.on("message", (topic, buffer, packet) => {
    queue = queue
      .then(async () => {
        if (packet.retain || buffer.length > 8192)
          throw Error("MESSAGE_REJECTED");
        const data = JSON.parse(buffer.toString());
        if (data.kind === "install") {
          let result;
          try {
            result = await engine.install(id, data.authorization);
          } catch (e: any) {
            const errors = [
              "WRONG_MODEL",
              "DEVICE_REVOKED",
              "PERMISSION_DENIED",
              "COMMAND_EXPIRED",
              "INVALID_SIGNATURE",
              "INVALID_CID",
              "ROLLBACK_BLOCKED",
              "FILE_TOO_LARGE",
              "IPFS_UNAVAILABLE",
              "HASH_MISMATCH",
              "REPLAY",
            ];
            const code = errors.includes(e.message)
              ? e.message
              : "DEPENDENCY_UNAVAILABLE";
            const failure = {
              deviceId: id,
              nonce: data.authorization.nonce,
              errorHash: stateHash(code),
              reportedAt: Math.floor(Date.now() / 1000),
            };
            const signature = await signers
              .get(id)!
              .signTypedData(
                homeDomain(c.chainId, c.registry),
                installFailureTypes,
                failure,
              );
            await client.publishAsync(
              `${c.prefix}/${id}/status`,
              JSON.stringify({
                kind: "installation-failure",
                ...failure,
                code,
                signature,
              }),
              { qos: 1, retain: false },
            );
            return;
          }
          await client.publishAsync(
            `${c.prefix}/${id}/status`,
            JSON.stringify({ kind: "installation", ...result }),
            { qos: 1, retain: false },
          );
        } else {
          const ack = await engine.command(id, data);
          await client.publishAsync(
            `${c.prefix}/${id}/acks`,
            JSON.stringify(ack),
            { qos: 1, retain: false },
          );
        }
      })
      .catch(() => {
        console.warn("Message refusé par le simulateur");
      });
  });
  return client;
}
const clients = [...signers.keys()].map((id) =>
  connectDevice(id, JSON.parse(required("DEVICE_MQTT_CREDENTIALS_JSON"))[id]),
);
let provisioningBusy = false;
const provisioningTimer = setInterval(async () => {
  if (provisioningBusy) return;
  provisioningBusy = true;
  try {
    for (const d of await provisioned(c.registry)) {
      if (signers.has(d.id)) continue;
      signers.set(d.id, new Wallet(d.privateKey));
      clients.push(connectDevice(d.id, d.credentials));
    }
  } catch {
    console.warn("Provisionnement temporairement indisponible");
  } finally {
    provisioningBusy = false;
  }
}, 2000);
const server = http.createServer((req, res) => {
  res.setHeader("Content-Type", "application/json");
  res.statusCode = clients.every((c) => c.connected) ? 200 : 503;
  res.end(
    JSON.stringify({
      service: "Raspberry Pi simulé",
      mqtt: clients.every((c) => c.connected),
    }),
  );
});
server.listen(
  Number(process.env.PORT ?? 3002),
  c.local ? "127.0.0.1" : "0.0.0.0",
);
const heartbeat = setInterval(async () => {
  try {
    const s = await store.read();
    for (const [index, id] of [...signers.keys()].entries()) {
      if (!clients[index].connected) continue;
      const device = s.devices?.[id];
      const status = {
        deviceId: id,
        stateHash: stateHash(device?.state ?? "État inconnu"),
        version: device?.version ?? 0,
        observedAt: Math.floor(Date.now() / 1000),
        deviceNonce: device?.nonce ?? 0,
      };
      const signature = await signers
        .get(id)!
        .signTypedData(homeDomain(c.chainId, c.registry), statusTypes, status);
      await clients[index].publishAsync(
        `${c.prefix}/${id}/status`,
        JSON.stringify({
          kind: "heartbeat",
          ...status,
          state: device?.state ?? "État inconnu",
          signature,
        }),
        { qos: 1, retain: false },
      );
    }
  } catch {
    console.warn("Présence MQTT non transmise");
  }
}, 10000);
async function stop() {
  clearInterval(heartbeat);
  clearInterval(provisioningTimer);
  await Promise.all(clients.map((c) => c.endAsync()));
  server.close();
  await store.close();
  process.exit(0);
}
process.on("SIGTERM", stop);
process.on("SIGINT", stop);
