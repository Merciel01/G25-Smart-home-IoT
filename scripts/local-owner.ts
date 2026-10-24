import fs from "node:fs/promises";
import {
  Wallet,
  Contract,
  ContractFactory,
  JsonRpcProvider,
  JsonRpcSigner,
  isAddress,
  id,
} from "ethers";
import { DEVICES, deviceId } from "../packages/shared/src/protocol.ts";
const owner = process.argv[2];
if (!isAddress(owner ?? "")) throw Error("Adresse publique complète requise");
const runtime = JSON.parse(await fs.readFile(".local/runtime.json", "utf8"));
if (runtime.APP_MODE !== "local" || runtime.CHAIN_ID !== "31337")
  throw Error("Hardhat local exclusivement");
const provider = new JsonRpcProvider(runtime.RPC_URL, undefined, {
  cacheTimeout: -1,
});
if ((await provider.getNetwork()).chainId !== 31337n)
  throw Error("WRONG_NETWORK");
const keys = JSON.parse(await fs.readFile(".local/identities.json", "utf8"));
const oldDeployment = JSON.parse(
  await fs.readFile("deployments/local.json", "utf8"),
);
const artifact = JSON.parse(
  await fs.readFile("artifacts/SmartHomeRegistry.json", "utf8"),
);
const archive = `.local/archive/owner-${Date.now()}`;
await fs.mkdir(archive, { recursive: true, mode: 0o700 });
for (const file of [
  "runtime.json",
  "gateway.json",
  "simulator.json",
  "identities.json",
])
  try {
    await fs.copyFile(`.local/${file}`, `${archive}/${file}`);
    await fs.chmod(`${archive}/${file}`, 0o600);
  } catch (e: any) {
    if (e.code !== "ENOENT") throw e;
  }
await fs.copyFile("deployments/local.json", `${archive}/deployment.json`);
await provider.send("hardhat_setBalance", [
  new Wallet(keys.admin).address,
  "0x3635c9adc5dea00000",
]);
await provider.send("hardhat_setBalance", [
  new Wallet(keys.relayer).address,
  "0x3635c9adc5dea00000",
]);
if ((await provider.getCode(runtime.FIRMWARE_REGISTRY_ADDRESS)) === "0x") {
  const fwArtifact = JSON.parse(
    await fs.readFile("artifacts/FirmwareRegistry.json", "utf8"),
  );
  const admin = new Wallet(keys.admin, provider);
  const fw: any = await new ContractFactory(
    fwArtifact.abi,
    fwArtifact.bytecode,
    admin,
  ).deploy(admin.address);
  await fw.waitForDeployment();
  for (const device of DEVICES)
    await (
      await fw.authorizeManufacturer(
        id(device.model),
        new Wallet(keys.manufacturer).address,
      )
    ).wait();
  runtime.FIRMWARE_REGISTRY_ADDRESS = await fw.getAddress();
  oldDeployment.firmwareRegistry = await fw.getAddress();
  oldDeployment.firmwareTransactionHash = fw.deploymentTransaction().hash;
}
const home: any = await new ContractFactory(
  artifact.abi,
  artifact.bytecode,
  new Wallet(keys.admin, provider),
).deploy(runtime.GATEWAY_SIGNER_ADDRESS);
await home.waitForDeployment();
const receipt = await home.deploymentTransaction().wait();
if ((await provider.getBalance(owner)) < 10n ** 18n)
  await provider.send("hardhat_setBalance", [owner, "0x56bc75e2d63100000"]);
const registrations = [];
await provider.send("hardhat_impersonateAccount", [owner]);
try {
  const signer = new JsonRpcSigner(provider, owner);
  const registry = new Contract(await home.getAddress(), artifact.abi, signer);
  for (const device of DEVICES) {
    const transaction = await registry.registerDevice(
      deviceId(device.label),
      new Wallet(keys[device.label]).address,
      id(device.model),
    );
    await transaction.wait();
    const stored = await registry.getDevice(deviceId(device.label));
    if (stored.owner.toLowerCase() !== owner.toLowerCase())
      throw Error("Propriété non confirmée");
    registrations.push({
      device: device.label,
      owner: stored.owner,
      transaction: transaction.hash,
    });
  }
} finally {
  await provider.send("hardhat_stopImpersonatingAccount", [owner]);
}
const registry = await home.getAddress();
runtime.REGISTRY_ADDRESS = registry;
runtime.DEPLOYMENT_BLOCK = String(receipt.blockNumber);
await fs.writeFile(".local/runtime.json", JSON.stringify(runtime, null, 2), {
  mode: 0o600,
});
await fs.writeFile(
  "deployments/local.json",
  JSON.stringify(
    {
      ...oldDeployment,
      registry,
      deploymentBlock: receipt.blockNumber,
      transactionHash: home.deploymentTransaction().hash,
      constructorArguments: {
        ...oldDeployment.constructorArguments,
        SmartHomeRegistry: runtime.GATEWAY_SIGNER_ADDRESS,
      },
    },
    null,
    2,
  ),
);
// The previous state remains in the archive. Fresh projections bind to the new registry.
for (const file of ["gateway.json", "simulator.json"])
  await fs.rm(`.local/${file}`, { force: true });
await fs.writeFile(
  "docs/propriete-demo-local.json",
  JSON.stringify(
    {
      network: 31337,
      registry,
      owner,
      registrations,
      bootstrap:
        "Enregistrement initial par impersonation Hardhat locale, aucune signature MetaMask ni clé privée utilisateur utilisée",
      previousRegistry: oldDeployment.registry,
    },
    null,
    2,
  ),
);
console.log(
  JSON.stringify(
    {
      owner,
      registry,
      devices: registrations.map((d) => d.device),
      archive,
      funds: "ETH fictifs locaux uniquement",
    },
    null,
    2,
  ),
);
