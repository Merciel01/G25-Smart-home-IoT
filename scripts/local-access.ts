import fs from "node:fs/promises";
import { Contract, JsonRpcProvider, Wallet, isAddress } from "ethers";
import { DEVICES, deviceId, same } from "../packages/shared/src/protocol.ts";
const [recipient, label, hoursText = "1"] = process.argv.slice(2);
const spec = DEVICES.find((d) => d.label === label?.toUpperCase());
const hours = Number(hoursText);
if (
  !isAddress(recipient ?? "") ||
  !spec ||
  !Number.isFinite(hours) ||
  hours <= 0 ||
  hours > 24
)
  throw Error(
    "Usage : npm run local:access -- 0xAdressePublique LOCK-01 1 (durée : 0 à 24 h)",
  );
const runtime = JSON.parse(await fs.readFile(".local/runtime.json", "utf8"));
if (runtime.APP_MODE !== "local" || Number(runtime.CHAIN_ID) !== 31337)
  throw Error("Hardhat local exclusivement");
const provider = new JsonRpcProvider(runtime.RPC_URL, undefined, {
  cacheTimeout: -1,
});
if ((await provider.getNetwork()).chainId !== 31337n)
  throw Error("WRONG_NETWORK");
const keys = JSON.parse(await fs.readFile(".local/identities.json", "utf8"));
const artifact = JSON.parse(
  await fs.readFile("artifacts/SmartHomeRegistry.json", "utf8"),
);
const owner = new Wallet(keys.owner, provider);
const home = new Contract(runtime.REGISTRY_ADDRESS, artifact.abi, owner);
const object = await home.getDevice(deviceId(spec.label));
if (!same(object.owner, owner.address) || object.revoked)
  throw Error(
    "Cet objet ne dépend pas du propriétaire de préparation actif. Utilisez Permissions avec son véritable propriétaire.",
  );
if (same(recipient, owner.address))
  throw Error("Ce compte est déjà propriétaire");
const block = await provider.getBlock("latest");
const expires =
  Math.max(block!.timestamp, Math.floor(Date.now() / 1000)) +
  Math.floor(hours * 3600);
const mask = spec.actions.reduce((mask, action) => mask | (1 << action), 0);
const receipt = await (
  await home.grantPermission(deviceId(spec.label), recipient, mask, expires)
).wait();
// Top up only a low balance; never lower a user's existing balance.
if ((await provider.getBalance(recipient)) < 10n ** 18n)
  await provider.send("hardhat_setBalance", [recipient, "0x56bc75e2d63100000"]);
console.log(
  JSON.stringify(
    {
      recipient,
      object: spec.label,
      expiresAt: new Date(expires * 1000).toISOString(),
      transaction: receipt.hash,
      network: "Hardhat local ; fonds fictifs",
    },
    null,
    2,
  ),
);
