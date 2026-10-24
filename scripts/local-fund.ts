import { JsonRpcProvider, isAddress } from "ethers";
const address = process.argv[2];
if (!isAddress(address))
  throw Error("Adresse publique de portefeuille requise");
const p = new JsonRpcProvider("http://127.0.0.1:8545");
if (Number((await p.getNetwork()).chainId) !== 31337)
  throw Error("Hardhat local exclusivement");
await p.send("hardhat_setBalance", [address, "0x56bc75e2d63100000"]);
console.log("Solde fictif local attribué. Aucune valeur réelle.");
