import fs from "node:fs/promises";
import { openSync, closeSync } from "node:fs";
import { spawn } from "node:child_process";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";
process.chdir(path.resolve(path.dirname(fileURLToPath(import.meta.url)), ".."));
await fs.mkdir(".local/logs", { recursive: true, mode: 0o700 });
const children = [];
let stopping = false;
function start(name, args, executable = process.execPath) {
  const fd = openSync(`.local/logs/${name}.log`, "a", 0o600);
  const child = spawn(executable, args, {
    stdio: ["ignore", fd, fd],
    env: process.env,
  });
  closeSync(fd);
  children.push({ name, child });
  child.on("error", () =>
    console.error(
      `Échec du service ${name}. Consultez .local/logs/${name}.log.`,
    ),
  );
  return child;
}
async function command(name, args, executable = process.execPath) {
  const child = start(name, args, executable);
  const code = await new Promise((resolve) => {
    child.once("exit", resolve);
    child.once("error", () => resolve(1));
  });
  if (code !== 0)
    throw Error(
      `Échec de ${name} ; consultez son journal privé dans .local/logs.`,
    );
}
async function fetchJson(url, options = {}) {
  const r = await fetch(url, { ...options, signal: AbortSignal.timeout(1800) });
  if (!r.ok) throw Error("Service indisponible");
  return r.json();
}
async function rpc(method, params = []) {
  const result = await fetchJson("http://127.0.0.1:8545", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  if (result.error) throw Error("RPC local en erreur");
  return result.result;
}
async function health(port, name) {
  try {
    const result = await fetchJson(`http://127.0.0.1:${port}/health`);
    return result.service === name;
  } catch {
    return false;
  }
}
async function portOpen(port) {
  return new Promise((resolve) => {
    const socket = net.connect({ port, host: "127.0.0.1" });
    socket.setTimeout(800);
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
}
async function wait(label, probe) {
  const until = Date.now() + 40000;
  while (Date.now() < until) {
    try {
      if (await probe()) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 400));
  }
  throw Error(`Démarrage non confirmé : ${label}. Consultez .local/logs.`);
}
async function shutdown(code = 0) {
  if (stopping) return;
  stopping = true;
  for (const { child } of [...children].reverse())
    if (child.exitCode === null) child.kill("SIGTERM");
  await Promise.race([
    Promise.all(
      children.map(({ child }) =>
        child.exitCode !== null
          ? Promise.resolve()
          : new Promise((r) => child.once("exit", r)),
      ),
    ),
    new Promise((r) => setTimeout(r, 5000)),
  ]);
  for (const { child } of children)
    if (child.exitCode === null && !child.signalCode) child.kill("SIGKILL");
  process.exitCode = code;
}
process.once("SIGINT", () => void shutdown());
process.once("SIGTERM", () => void shutdown());
try {
  await command("compilation", ["scripts/compile.mjs"]);
  let chainId;
  try {
    chainId = await rpc("eth_chainId");
  } catch {}
  if (!chainId) {
    if (await portOpen(8545))
      throw Error("Le port 8545 est occupé par un service inconnu.");
    start("chain", [
      "node_modules/hardhat/dist/src/cli.js",
      "node",
      "--hostname",
      "127.0.0.1",
    ]);
    await wait(
      "chaîne Hardhat",
      async () => (await rpc("eth_chainId")) === "0x7a69",
    );
  } else if (chainId !== "0x7a69")
    throw Error("Le RPC local doit être Hardhat 31337.");
  let runtime;
  try {
    runtime = JSON.parse(await fs.readFile(".local/runtime.json", "utf8"));
  } catch {}
  let deployed = false;
  if (runtime) {
    const url = new URL(runtime.RPC_URL);
    if (
      !["127.0.0.1", "localhost"].includes(url.hostname) ||
      runtime.CHAIN_ID !== "31337"
    )
      throw Error(
        "Configuration locale incompatible ; aucun réseau public ne sera utilisé.",
      );
    deployed =
      (await rpc("eth_getCode", [runtime.REGISTRY_ADDRESS, "latest"])) !==
        "0x" &&
      (await rpc("eth_getCode", [
        runtime.FIRMWARE_REGISTRY_ADDRESS,
        "latest",
      ])) !== "0x";
  }
  if (!deployed) {
    if (
      (await portOpen(3001)) ||
      (await portOpen(3002)) ||
      (await portOpen(8883))
    )
      throw Error(
        "Arrêtez les anciens services locaux avant de préparer un nouveau déploiement.",
      );
    await command("preparation", ["scripts/setup-local.sh"], "bash");
    runtime = JSON.parse(await fs.readFile(".local/runtime.json", "utf8"));
  }
  // A broker already listening is checked with its authenticated TLS session below.
  if (
    ["localhost", "127.0.0.1"].includes(new URL(runtime.MQTT_URL).hostname) &&
    !(await portOpen(8883))
  )
    start("broker", ["--import", "tsx", "scripts/local-service.ts", "broker"]);
  const { default: mqtt } = await import("mqtt");
  await wait("MQTT TLS authentifié", async () => {
    const client = mqtt.connect(runtime.MQTT_URL, {
      username: runtime.MQTT_USERNAME,
      password: runtime.MQTT_PASSWORD,
      ...(runtime.MQTT_CA_FILE
        ? { ca: await fs.readFile(runtime.MQTT_CA_FILE) }
        : {}),
      rejectUnauthorized: true,
      reconnectPeriod: 0,
      connectTimeout: 1600,
    });
    try {
      return await new Promise((resolve) => {
        client.once("connect", () => resolve(true));
        client.once("error", () => resolve(false));
        client.once("close", () => resolve(false));
      });
    } finally {
      await client.endAsync(true);
    }
  });
  for (const [service, port, label] of [
    ["gateway", 3001, "SmartHome G25"],
    ["simulator", 3002, "Raspberry Pi simulé"],
  ]) {
    if (!(await health(port, label))) {
      if (await portOpen(port))
        throw Error(`Le port ${port} est occupé par un service inconnu.`);
      start(service, ["--import", "tsx", "scripts/local-service.ts", service]);
      await wait(label, () => health(port, label));
    }
  }
  const web = async () => {
    try {
      const r = await fetch("http://127.0.0.1:5173", {
        signal: AbortSignal.timeout(1800),
      });
      return r.ok && (await r.text()).includes("SmartHome");
    } catch {
      return false;
    }
  };
  if (!(await web())) {
    if (await portOpen(5173))
      throw Error("Le port 5173 est occupé par un autre service.");
    start("web", [
      "node_modules/vite/bin/vite.js",
      "apps/web",
      "--host",
      "127.0.0.1",
    ]);
    await wait("interface React", web);
  }
  console.log("SmartHome G25 prêt : http://127.0.0.1:5173");
  console.log(
    "API : http://127.0.0.1:3001/health ; objets : http://127.0.0.1:3002/health",
  );
  console.log("Journaux privés : .local/logs/. Aucun fonds réel utilisé.");
  const owned = children.filter(({ child }) => child.exitCode === null);
  if (owned.length) {
    console.log(
      "Ctrl+C arrête uniquement les services lancés par cette commande.",
    );
    await Promise.race(
      owned.map(
        ({ name, child }) =>
          new Promise((resolve, reject) =>
            child.once("exit", (code) =>
              stopping
                ? resolve()
                : reject(Error(`Le service ${name} s’est arrêté (${code}).`)),
            ),
          ),
      ),
    );
  } else console.log("Les services existants ont été conservés.");
} catch (error) {
  console.error(error.message);
  await shutdown(1);
}
