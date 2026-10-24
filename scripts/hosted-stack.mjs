import { spawn } from "node:child_process";
if (process.env.APP_MODE !== "sepolia" || process.env.CHAIN_ID !== "11155111") {
  console.error(
    "Hébergement : APP_MODE=sepolia et CHAIN_ID=11155111 requis ; aucun repli local.",
  );
  process.exit(1);
}
const port = Number(process.env.PORT ?? 3001);
if (!Number.isInteger(port) || port < 1 || port > 65535)
  throw Error("PORT invalide");
const children = [];
let stopping = false;
function start(role) {
  const env = {
    ...process.env,
    PORT: String(role === "gateway" ? port : port === 3002 ? 3003 : 3002),
  };
  const remove =
    role === "gateway"
      ? ["DEVICE_KEYS_JSON", "DEVICE_MQTT_CREDENTIALS_JSON"]
      : [
          "FLESPI_TOKEN",
          "BROKER_API_KEY",
          "BROKER_API_SECRET",
          "GATEWAY_SIGNING_KEY",
          "GATEWAY_RELAYER_KEY",
          "MQTT_USERNAME",
          "MQTT_PASSWORD",
          "IPFS_API_TOKEN",
          "IPFS_API_URL",
        ];
  for (const key of [
    ...remove,
    "DEPLOYER_PRIVATE_KEY",
    "ETHERSCAN_API_KEY",
    "MANUFACTURER_PRIVATE_KEY",
  ])
    delete env[key];
  if (role === "simulator") env.API_BASE_URL = `http://127.0.0.1:${port}`;
  const child = spawn(
    process.execPath,
    ["--import", "tsx", `apps/${role}/src/main.ts`],
    { env, stdio: "inherit" },
  );
  children.push(child);
  child.on("error", () => {
    console.error(`Démarrage ${role} impossible.`);
    void shutdown(1);
  });
  child.on("exit", () => {
    if (!stopping) {
      console.error(`Le service ${role} s’est arrêté.`);
      void shutdown(1);
    }
  });
  return child;
}
async function shutdown(code = 0) {
  if (stopping) return;
  stopping = true;
  for (const child of children)
    if (child.exitCode === null) child.kill("SIGTERM");
  await Promise.race([
    Promise.all(
      children.map((child) =>
        child.exitCode !== null
          ? Promise.resolve()
          : new Promise((resolve) => child.once("exit", resolve)),
      ),
    ),
    new Promise((resolve) => setTimeout(resolve, 5000)),
  ]);
  for (const child of children)
    if (child.exitCode === null && !child.signalCode) child.kill("SIGKILL");
  process.exitCode = code;
}
process.once("SIGINT", () => void shutdown());
process.once("SIGTERM", () => void shutdown());
try {
  const gateway = start("gateway");
  let ready = false;
  for (let i = 0; i < 60 && !stopping; i++) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/health`, {
        signal: AbortSignal.timeout(1000),
      });
      ready = response.ok;
    } catch {}
    if (ready) break;
    if (gateway.exitCode !== null) throw Error("Gateway exited");
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  if (!ready || stopping) throw Error("Gateway not ready");
  start("simulator");
  console.log(
    "API et simulateur démarrés dans une instance ; vérifier le transport et les présences avant d’annoncer la disponibilité.",
  );
} catch {
  console.error(
    "Démarrage hébergé non confirmé. Vérifier la configuration serveur privée.",
  );
  await shutdown(1);
}
