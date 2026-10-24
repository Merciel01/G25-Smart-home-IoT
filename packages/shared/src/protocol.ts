import { id, verifyTypedData, sha256, keccak256, toUtf8Bytes } from "ethers";
import { z } from "zod";
export const ACTIONS = [
  "LOCK",
  "UNLOCK",
  "ON",
  "OFF",
  "ACTIVATE",
  "DEACTIVATE",
] as const;
export const DEVICES = [
  {
    label: "LOCK-01",
    name: "Serrure · Entrée",
    model: "G25-LOCK",
    actions: [0, 1],
  },
  {
    label: "PLUG-01",
    name: "Prise · Salon",
    model: "G25-PLUG",
    actions: [2, 3],
  },
  {
    label: "CAM-01",
    name: "Caméra · Entrée",
    model: "G25-CAM",
    actions: [4, 5],
  },
];
export const deviceId = (s: string) => id(s.trim().toUpperCase());
export const homeDomain = (chainId: number, registry: string) => ({
  name: "G25Home",
  version: "1",
  chainId,
  verifyingContract: registry,
});
export const firmwareDomain = (chainId: number, registry: string) => ({
  name: "G25Firmware",
  version: "1",
  chainId,
  verifyingContract: registry,
});
const fields = (spec: string) =>
  spec.split(",").map((s) => {
    const [name, type] = s.split(":");
    return { name, type };
  });
export const ackTypes = {
  Ack: fields(
    "requestId:bytes32,deviceId:bytes32,action:uint8,outcome:uint8,stateHash:bytes32,executedAt:uint64,deviceNonce:uint64",
  ),
};
export const commandTypes = {
  CommandEnvelope: fields(
    "protocolVersion:uint8,chainId:uint256,registry:address,requestId:bytes32,deviceId:bytes32,action:uint8,requester:address,permissionRevision:uint64,issuedAt:uint64,expiresAt:uint64",
  ),
};
export const manifestTypes = {
  FirmwareManifest: fields(
    "modelId:bytes32,version:uint64,sha256Digest:bytes32,cidHash:bytes32,fileSize:uint64,manufacturer:address",
  ),
};
export const installTypes = {
  Install: fields(
    "deviceId:bytes32,version:uint64,nonce:bytes32,expiresAt:uint64",
  ),
};
export const installResultTypes = {
  InstallResult: fields(
    "deviceId:bytes32,version:uint64,nonce:bytes32,stateHash:bytes32,installedAt:uint64",
  ),
};
export const hex32 = z.string().regex(/^0x[0-9a-fA-F]{64}$/);
export const address = z.string().regex(/^0x[0-9a-fA-F]{40}$/);
export const signature = z.string().regex(/^0x[0-9a-fA-F]{130}$/);
const uint = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
export const commandSchema = z
  .object({
    protocolVersion: z.literal(1),
    chainId: uint,
    registry: address,
    requestId: hex32,
    deviceId: hex32,
    action: z.number().int().min(0).max(5),
    requester: address,
    permissionRevision: uint,
    issuedAt: uint,
    expiresAt: uint,
    signature,
  })
  .strict();
export const ackSchema = z
  .object({
    requestId: hex32,
    deviceId: hex32,
    action: z.number().int().min(0).max(5),
    outcome: z.number().int().min(0).max(1),
    stateHash: hex32,
    executedAt: uint,
    deviceNonce: uint,
    signature,
    state: z.string().max(50),
  })
  .strict();
export const installSchema = z
  .object({
    deviceId: hex32,
    version: uint.positive(),
    nonce: hex32,
    expiresAt: uint,
    signature,
  })
  .strict();
export type Envelope = z.infer<typeof commandSchema>;
export type Ack = z.infer<typeof ackSchema>;
export const same = (a: string, b: string) =>
  a.toLowerCase() === b.toLowerCase();
export function signedBy(
  domain: any,
  types: any,
  value: any,
  sig: string,
  expected: string,
) {
  try {
    return same(verifyTypedData(domain, types, value, sig), expected);
  } catch {
    return false;
  }
}
export const stateHash = (state: string) => sha256(toUtf8Bytes(state));
export const cidSchema = z.string().regex(/^b[a-z2-7]{9,99}$/);
export const cidHash = (cid: string) =>
  keccak256(toUtf8Bytes(cidSchema.parse(cid)));
export const json = (value: unknown) =>
  JSON.stringify(value, (_k, v) => (typeof v === "bigint" ? v.toString() : v));

export const statusTypes = {
  Status: fields(
    "deviceId:bytes32,stateHash:bytes32,version:uint64,observedAt:uint64,deviceNonce:uint64",
  ),
};
export const installFailureTypes = {
  InstallFailure: fields(
    "deviceId:bytes32,nonce:bytes32,errorHash:bytes32,reportedAt:uint64",
  ),
};
