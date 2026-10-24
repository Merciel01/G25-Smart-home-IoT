import "dotenv/config";
import fs from "node:fs/promises";
import {
  Wallet,
  NonceManager,
  JsonRpcProvider,
  ContractFactory,
  id,
} from "ethers";
import { DEVICES, deviceId } from "../packages/shared/src/protocol.ts";
const local = process.argv.includes("--local");
if (!local && !process.argv.includes("--sepolia"))
  throw Error("Choisir --local ou --sepolia");
const url = local
  ? (process.env.RPC_URL ?? "http://127.0.0.1:8545")
  : process.env.RPC_URL;
if (!url) throw Error("RPC_URL manquant");
const p = new JsonRpcProvider(url);
const chainId = Number((await p.getNetwork()).chainId);
if (chainId !== (local ? 31337 : 11155111)) throw Error("WRONG_NETWORK");
let identities: any;
let admin: Wallet;
let gateway: string;
let manufacturer: string;
if (local) {
  await fs.mkdir(".local", { recursive: true, mode: 0o700 });
  identities = Object.fromEntries(
    [
      "admin",
      "owner",
      "guest",
      "manufacturer",
      "gateway",
      "relayer",
      ...DEVICES.map((d) => d.label),
    ].map((k) => [k, Wallet.createRandom().privateKey]),
  );
  await fs.writeFile(".local/identities.json", JSON.stringify(identities), {
    mode: 0o600,
  });
  for (const k of Object.values(identities) as string[])
    await p.send("hardhat_setBalance", [
      new Wallet(k).address,
      "0x3635c9adc5dea00000",
    ]);
  admin = new Wallet(identities.admin, p);
  gateway = new Wallet(identities.gateway).address;
  manufacturer = new Wallet(identities.manufacturer).address;
} else {
  if (
    !process.env.DEPLOYER_PRIVATE_KEY ||
    !process.env.GATEWAY_SIGNER_ADDRESS ||
    !process.env.MANUFACTURER_ADDRESS
  )
    throw Error("Configuration de déploiement incomplète");
  admin = new Wallet(process.env.DEPLOYER_PRIVATE_KEY, p);
  gateway = process.env.GATEWAY_SIGNER_ADDRESS;
  manufacturer = process.env.MANUFACTURER_ADDRESS;
}
const signer = new NonceManager(admin);
const artifacts: any = {};
for (const name of ["SmartHomeRegistry", "FirmwareRegistry"])
  artifacts[name] = JSON.parse(
    await fs.readFile(`artifacts/${name}.json`, "utf8"),
  );
const home: any = await new ContractFactory(
  artifacts.SmartHomeRegistry.abi,
  artifacts.SmartHomeRegistry.bytecode,
  signer,
).deploy(gateway);
await home.waitForDeployment();
const fw: any = await new ContractFactory(
  artifacts.FirmwareRegistry.abi,
  artifacts.FirmwareRegistry.bytecode,
  signer,
).deploy(admin.address);
await fw.waitForDeployment();
const receipts: any[] = [];
for (const model of DEVICES)
  receipts.push(
    await (
      await fw.authorizeManufacturer(id(model.model), manufacturer)
    ).wait(),
  );
if (local && process.env.LOCAL_MANUAL !== "1") {
  const owner = new NonceManager(new Wallet(identities.owner, p));
  for (const d of DEVICES)
    receipts.push(
      await (
        await home
          .connect(owner)
          .registerDevice(
            deviceId(d.label),
            new Wallet(identities[d.label]).address,
            id(d.model),
          )
      ).wait(),
    );
}
const tx = home.deploymentTransaction();
const receipt = await tx!.wait();
const result = {
  chainId,
  registry: await home.getAddress(),
  firmwareRegistry: await fw.getAddress(),
  deploymentBlock: receipt!.blockNumber,
  transactionHash: tx!.hash,
  firmwareTransactionHash: fw.deploymentTransaction().hash,
  compiler: "0.8.30",
  optimizerRuns: 200,
  evmVersion: "cancun",
  verified: false,
  constructorArguments: {
    SmartHomeRegistry: gateway,
    FirmwareRegistry: admin.address,
  },
  abi: artifacts.SmartHomeRegistry.abi,
  firmwareAbi: artifacts.FirmwareRegistry.abi,
};
await fs.mkdir("deployments", { recursive: true });
await fs.writeFile(
  `deployments/${local ? "local" : "sepolia"}.json`,
  JSON.stringify(result, null, 2),
);
if (local) {
  const pass = () => Wallet.createRandom().privateKey.slice(2);
  const mqttPassword = pass();
  const creds = Object.fromEntries(
    DEVICES.map((d) => [
      deviceId(d.label),
      { username: d.label, password: pass() },
    ]),
  );
  const runtime = {
    APP_MODE: "local",
    CHAIN_ID: "31337",
    RPC_URL: url,
    REGISTRY_ADDRESS: result.registry,
    FIRMWARE_REGISTRY_ADDRESS: result.firmwareRegistry,
    DEPLOYMENT_BLOCK: String(result.deploymentBlock),
    CONFIRMATION_COUNT: "1",
    GATEWAY_SIGNING_KEY: identities.gateway,
    GATEWAY_SIGNER_ADDRESS: gateway,
    GATEWAY_RELAYER_KEY: identities.relayer,
    DEVICE_KEYS_JSON: JSON.stringify(
      Object.fromEntries(
        DEVICES.map((d) => [deviceId(d.label), identities[d.label]]),
      ),
    ),
    DEVICE_MQTT_CREDENTIALS_JSON: JSON.stringify(creds),
    MQTT_URL: "mqtts://localhost:8883",
    MQTT_USERNAME: "gateway",
    MQTT_PASSWORD: mqttPassword,
    MQTT_CA_FILE: ".local/tls/cert.pem",
    MQTT_PREFIX: "g25/home01",
    ALLOWED_ORIGINS: "http://localhost:5173,http://127.0.0.1:5173",
    API_BASE_URL: "http://127.0.0.1:3001",
    IPFS_GATEWAY_URL: "http://127.0.0.1:3001/ipfs",
  };
  await fs.writeFile(".local/runtime.json", JSON.stringify(runtime, null, 2), {
    mode: 0o600,
  });
  await fs.writeFile(
    ".local/gas.json",
    JSON.stringify(
      receipts.map((r) => ({ hash: r.hash, gasUsed: String(r.gasUsed) })),
      null,
      2,
    ),
  );
}
console.log(
  `Contrats déployés sur ${local ? "Hardhat local" : "Sepolia"} ; métadonnées dans deployments/${local ? "local" : "sepolia"}.json. Vérification explorateur : non effectuée.`,
);
