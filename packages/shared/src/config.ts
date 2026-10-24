import "dotenv/config";
import fs from "node:fs";
import { Contract, JsonRpcProvider, Wallet, NonceManager } from "ethers";
export function required(name: string) {
  const v = process.env[name];
  if (!v) throw Error("Configuration absente: " + name);
  return v;
}
export function config() {
  const local = process.env.APP_MODE === "local";
  const chainId = Number(required("CHAIN_ID"));
  if (![31337, 11155111].includes(chainId) || (!local && chainId !== 11155111))
    throw Error("Réseau de test requis");
  if (!local) {
    required("DATABASE_URL");
    if (!required("MQTT_URL").startsWith("mqtts://"))
      throw Error("MQTT TLS requis");
    if (
      !required("ALLOWED_ORIGINS")
        .split(",")
        .every((s) => s.startsWith("https://"))
    )
      throw Error("Origine HTTPS requise");
  }
  const provider = new JsonRpcProvider(required("RPC_URL"), chainId, {
    cacheTimeout: -1,
  });
  const homeArtifact = JSON.parse(
    fs.readFileSync("artifacts/SmartHomeRegistry.json", "utf8"),
  );
  const fwArtifact = JSON.parse(
    fs.readFileSync("artifacts/FirmwareRegistry.json", "utf8"),
  );
  const registry = required("REGISTRY_ADDRESS");
  const firmware = required("FIRMWARE_REGISTRY_ADDRESS");
  return {
    local,
    chainId,
    provider,
    registry,
    firmware,
    homeArtifact,
    fwArtifact,
    home: new Contract(registry, homeArtifact.abi, provider),
    fw: new Contract(firmware, fwArtifact.abi, provider),
    prefix: process.env.MQTT_PREFIX ?? "g25/home01",
    confirmations: Math.max(1, Number(process.env.CONFIRMATION_COUNT ?? 2)),
    block: Number(required("DEPLOYMENT_BLOCK")),
  };
}
export function mqttOptions(credentials?: {
  username: string;
  password: string;
}) {
  return {
    username: credentials?.username ?? required("MQTT_USERNAME"),
    password:
      credentials?.password ??
      (process.env.BROKER_PROVISIONING_DRIVER === "flespi"
        ? undefined
        : required("MQTT_PASSWORD")),
    rejectUnauthorized: true,
    ...(process.env.MQTT_CA_FILE
      ? { ca: fs.readFileSync(process.env.MQTT_CA_FILE) }
      : {}),
    reconnectPeriod: 1000,
    connectTimeout: 5000,
    queueQoSZero: false,
  };
}
export function relayer(provider: JsonRpcProvider) {
  return new NonceManager(
    new Wallet(required("GATEWAY_RELAYER_KEY"), provider),
  );
}
