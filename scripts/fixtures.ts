import fs from "node:fs/promises";
import { Wallet, id, sha256, ZeroAddress } from "ethers";
import {
  firmwareDomain,
  manifestTypes,
  cidHash,
  homeDomain,
  commandTypes,
} from "../packages/shared/src/protocol.ts";
// Public vectors only. Random throwaway signing keys are never exported or saved.
const manufacturer = Wallet.createRandom(),
  attacker = Wallet.createRandom();
const registry = Wallet.createRandom().address;
const domain = firmwareDomain(31337, registry);
const cid = "bafkreiaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const fixtures: any = {
  warning:
    "Vecteurs cryptographiques hors chaîne uniquement. CID syntaxique de test, sans publication IPFS ni autorisation fabricant attestée.",
  domain,
  expectedManufacturer: manufacturer.address,
  cases: {},
};
for (const [name, file, modelId, version, wrongSigner] of [
  ["healthy-1.0.0", "G25-LOCK-1.0.0.bin", id("G25-LOCK"), 10000, false],
  ["healthy-1.1.0", "G25-LOCK-1.1.0.bin", id("G25-LOCK"), 10100, false],
  ["invalid-signature", "G25-LOCK-1.1.0.bin", id("G25-LOCK"), 10100, true],
  ["wrong-model", "G25-LOCK-1.1.0.bin", id("G25-CAM"), 10100, false],
  ["old-version", "G25-LOCK-1.0.0.bin", id("G25-LOCK"), 9999, false],
] as const) {
  const bytes = await fs.readFile("firmware/" + file);
  const manifest = {
    modelId,
    version,
    sha256Digest: sha256(bytes),
    cidHash: cidHash(cid),
    fileSize: bytes.length,
    manufacturer: manufacturer.address,
  };
  fixtures.cases[name] = {
    file,
    cid,
    manifest,
    signature: await (wrongSigner ? attacker : manufacturer).signTypedData(
      domain,
      manifestTypes,
      manifest,
    ),
  };
}
fixtures.cases["tampered-file"] = {
  ...fixtures.cases["healthy-1.1.0"],
  file: "altered.bin",
  expectedFailure: "HASH_MISMATCH",
};
const gateway = Wallet.createRandom();
const envelope = {
  protocolVersion: 1,
  chainId: 31337,
  registry,
  requestId: id("vector-command"),
  deviceId: id("LOCK-01"),
  action: 1,
  requester: manufacturer.address,
  permissionRevision: 1,
  issuedAt: 1700000000,
  expiresAt: 1700000120,
};
fixtures.command = {
  domain: homeDomain(31337, registry),
  expectedGateway: gateway.address,
  envelope,
  signature: await gateway.signTypedData(
    homeDomain(31337, registry),
    commandTypes,
    envelope,
  ),
  warning: "Horodatage volontairement ancien ; ne doit jamais être exécuté.",
};
await fs.writeFile("firmware/fixtures.json", JSON.stringify(fixtures, null, 2));
console.log("Fixtures publiques générées, aucune clé conservée.");
