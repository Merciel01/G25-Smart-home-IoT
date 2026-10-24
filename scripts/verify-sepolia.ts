import "dotenv/config";
import fs from "node:fs/promises";
import { AbiCoder } from "ethers";
const key = process.env.ETHERSCAN_API_KEY;
if (!key) throw Error("ETHERSCAN_API_KEY manquante");
const d = JSON.parse(await fs.readFile("deployments/sepolia.json", "utf8"));
if (d.chainId !== 11155111) throw Error("Sepolia uniquement");
const code = await fs.readFile("artifacts/verification-input.json", "utf8");
const endpoint = "https://api.etherscan.io/v2/api?chainid=11155111";
async function call(body: Record<string, string>) {
  const r = await fetch(endpoint, {
    method: "POST",
    body: new URLSearchParams({ ...body, apikey: key! }),
    signal: AbortSignal.timeout(20000),
  });
  if (!r.ok) throw Error("Explorateur indisponible");
  return r.json() as Promise<any>;
}
const statuses: any = {};
for (const name of ["SmartHomeRegistry", "FirmwareRegistry"]) {
  const address =
    name === "SmartHomeRegistry" ? d.registry : d.firmwareRegistry;
  const argument =
    d.constructorArguments?.[name] ??
    (name === "SmartHomeRegistry"
      ? process.env.GATEWAY_SIGNER_ADDRESS
      : process.env.DEPLOYER_ADDRESS);
  if (!argument)
    throw Error("GATEWAY_SIGNER_ADDRESS et DEPLOYER_ADDRESS requis");
  let r = await call({
    module: "contract",
    action: "verifysourcecode",
    contractaddress: address,
    sourceCode: code,
    codeformat: "solidity-standard-json-input",
    contractname: `packages/contracts/contracts/${name}.sol:${name}`,
    compilerversion: "v0.8.30+commit.73712a01",
    constructorArguements: AbiCoder.defaultAbiCoder()
      .encode(["address"], [argument])
      .slice(2),
  });
  if (r.status !== "1")
    throw Error(
      "Soumission explorateur refusée : " + String(r.result).slice(0, 200),
    );
  const guid = r.result;
  let verified = false;
  for (let i = 0; i < 20; i++) {
    await new Promise((resolve) => setTimeout(resolve, 3000));
    r = await call({ module: "contract", action: "checkverifystatus", guid });
    if (r.status === "1") {
      verified = true;
      break;
    }
    if (!String(r.result).includes("Pending")) break;
  }
  statuses[name] = {
    address,
    verified,
    url: `https://sepolia.etherscan.io/address/${address}#code`,
  };
  if (!verified) throw Error("Vérification non confirmée pour " + name);
}
d.verified = Object.values(statuses).every((v: any) => v.verified);
d.verification = statuses;
await fs.writeFile("deployments/sepolia.json", JSON.stringify(d, null, 2));
console.log(
  "Les deux contrats ont une vérification confirmée par l’explorateur.",
);
