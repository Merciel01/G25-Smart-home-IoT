import fs from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { Contract, JsonRpcProvider, Wallet } from "ethers";
import assert from "node:assert/strict";
import { deviceId } from "../packages/shared/src/protocol.ts";
const runtime = JSON.parse(await fs.readFile(".local/runtime.json", "utf8"));
if (runtime.APP_MODE !== "local") throw Error("Test local exclusivement");
const recipient = Wallet.createRandom().address;
execFileSync(
  process.execPath,
  ["--import", "tsx", "scripts/local-access.ts", recipient, "PLUG-01", "1"],
  { stdio: "pipe" },
);
const keys = JSON.parse(await fs.readFile(".local/identities.json", "utf8"));
const artifact = JSON.parse(
  await fs.readFile("artifacts/SmartHomeRegistry.json", "utf8"),
);
const provider = new JsonRpcProvider(runtime.RPC_URL, undefined, {
  cacheTimeout: -1,
});
const home = new Contract(
  runtime.REGISTRY_ADDRESS,
  artifact.abi,
  new Wallet(keys.owner, provider),
);
try {
  assert.equal(
    await home.hasPermission(deviceId("PLUG-01"), recipient, 2),
    true,
  );
  assert.equal(
    await home.hasPermission(deviceId("PLUG-01"), recipient, 3),
    true,
  );
  assert.equal(
    await home.hasPermission(deviceId("LOCK-01"), recipient, 0),
    false,
  );
  assert.ok((await provider.getBalance(recipient)) > 0n);
} finally {
  await (await home.revokePermission(deviceId("PLUG-01"), recipient)).wait();
}
assert.equal(
  await home.hasPermission(deviceId("PLUG-01"), recipient, 2),
  false,
);
await fs.writeFile(
  "docs/preuve-comptes-local.json",
  JSON.stringify(
    {
      network: 31337,
      recipient,
      checks: [
        "accès explicite PLUG ON/OFF",
        "aucun accès serrure",
        "fonds fictifs",
        "révocation effective",
      ],
      passed: true,
    },
    null,
    2,
  ),
);
console.log("Accès local : octroi, isolation et révocation vérifiés.");
