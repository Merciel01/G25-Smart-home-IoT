import { spawn } from "node:child_process";
const url = "http://127.0.0.1:18545";
const chain = spawn(
  process.execPath,
  [
    "node_modules/hardhat/dist/src/cli.js",
    "node",
    "--hostname",
    "127.0.0.1",
    "--port",
    "18545",
  ],
  { stdio: "ignore" },
);
let code = 0;
async function run(file) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, ["--import", "tsx", file], {
      stdio: "inherit",
      env: { ...process.env, TEST_RPC_URL: url },
    });
    child.on("exit", (c) => resolve(c ?? 1));
    child.on("error", () => resolve(1));
  });
}
try {
  let ready = false;
  for (let attempt = 0; attempt < 100; attempt++) {
    try {
      const r = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "eth_chainId",
          params: [],
        }),
      });
      if ((await r.json()).result === "0x7a69") {
        ready = true;
        break;
      }
    } catch {}
    await new Promise((r) => setTimeout(r, 100));
  }
  if (!ready) throw Error("Hardhat de test indisponible");
  for (const file of [
    "packages/contracts/test/registry.test.ts",
    "tests/protocol.test.ts",
    "tests/auth.test.ts",
    "tests/indexer.test.ts",
    "tests/external-broker.test.ts",
    "tests/flespi-broker.test.ts",
    "tests/postgres-options.test.ts",
  ]) {
    console.log("\nFichier : " + file);
    const result = await run(file);
    if (result) code = result;
  }
} catch (e) {
  console.error(e.message);
  code = 1;
} finally {
  chain.kill("SIGTERM");
}
process.exitCode = code;
