import fs from "node:fs/promises";
import dotenv from "dotenv";
import net from "node:net";
import { randomBytes } from "node:crypto";
import { Wallet, JsonRpcProvider } from "ethers";
import { FlespiBroker } from "../packages/shared/src/flespi-broker.ts";
for (const port of [3001, 3002]) {
  const busy = await new Promise<boolean>((resolve) => {
    const socket = net.connect({ host: "127.0.0.1", port });
    socket.setTimeout(500);
    socket.once("connect", () => {
      socket.destroy();
      resolve(true);
    });
    socket.once("error", () => resolve(false));
    socket.once("timeout", () => {
      socket.destroy();
      resolve(false);
    });
  });
  if (busy)
    throw Error(
      "Arrêtez la passerelle et le simulateur avant la bascule MQTT.",
    );
}
const privateFile = ".local/external/flespi.env";
const env = dotenv.parse(await fs.readFile(privateFile));
const runtime = JSON.parse(await fs.readFile(".local/runtime.json", "utf8"));
if (runtime.APP_MODE !== "local" || runtime.CHAIN_ID !== "31337")
  throw Error("Hardhat local uniquement");
const provider = new JsonRpcProvider(runtime.RPC_URL);
if ((await provider.getNetwork()).chainId !== 31337n)
  throw Error("WRONG_NETWORK");
await provider.destroy();
const prefix = env.MQTT_PREFIX || "g25/" + randomBytes(12).toString("hex");
const broker = new FlespiBroker(env.FLESPI_TOKEN, prefix);
await broker.checkConfiguration();
if (!env.MQTT_PREFIX)
  await fs.appendFile(privateFile, "\nMQTT_PREFIX=" + prefix + "\n");
const archive = `.local/archive/flespi-${Date.now()}`;
await fs.mkdir(archive, { recursive: true, mode: 0o700 });
await fs.copyFile(".local/runtime.json", archive + "/runtime.json");
let provisioning: any = { devices: {} };
try {
  provisioning = JSON.parse(
    await fs.readFile(".local/provisioning.json", "utf8"),
  );
  await fs.copyFile(".local/provisioning.json", archive + "/provisioning.json");
} catch (e: any) {
  if (e.code !== "ENOENT") throw e;
}
const gateway = await broker.ensureDevice({ id: "" }, true);
const credentials: any = {};
const publicIdentities: any = {};
const keys = JSON.parse(runtime.DEVICE_KEYS_JSON);
const { DEVICES, deviceId } =
  await import("../packages/shared/src/protocol.ts");
const dynamic = Object.values(provisioning.devices ?? {}).filter(
  (d: any) =>
    d.registry.toLowerCase() === runtime.REGISTRY_ADDRESS.toLowerCase(),
) as any[];
if (dynamic.length + Object.keys(keys).length > 49)
  throw Error("Trop d’appareils pour le quota flespi Free");
for (const [id, key] of Object.entries(keys)) {
  credentials[id] = (await broker.ensureDevice({ id })).credentials;
  const spec = DEVICES.find((s) => deviceId(s.label) === id);
  if (spec) publicIdentities[spec.label] = new Wallet(String(key)).address;
}
for (const record of dynamic) {
  const prepared = await broker.ensureDevice({ id: record.id });
  Object.assign(record, prepared, { status: "ready" });
}
Object.assign(runtime, {
  MQTT_URL: "mqtts://mqtt.flespi.io:8883",
  MQTT_PREFIX: prefix,
  MQTT_CA_FILE: "",
  MQTT_USERNAME: gateway.credentials.username,
  MQTT_PASSWORD: "",
  BROKER_PROVISIONING_DRIVER: "flespi",
  FLESPI_TOKEN: env.FLESPI_TOKEN,
  DEVICE_MQTT_CREDENTIALS_JSON: JSON.stringify(credentials),
  PUBLIC_DEVICE_IDENTITIES_JSON: JSON.stringify(publicIdentities),
});
async function atomic(file: string, data: any) {
  await fs.writeFile(file + ".tmp", JSON.stringify(data, null, 2), {
    mode: 0o600,
  });
  await fs.rename(file + ".tmp", file);
  await fs.chmod(file, 0o600);
}
await atomic(".local/provisioning.json", provisioning);
await atomic(".local/runtime.json", runtime);
console.log(
  JSON.stringify(
    {
      broker: "mqtt.flespi.io:8883",
      chain: "Hardhat 31337 inchangé",
      initialDevices: Object.keys(keys).length,
      dynamicDevices: dynamic.length,
      archive,
      note: "Credentials privés configurés, services à redémarrer ; Sepolia non activé",
    },
    null,
    2,
  ),
);
