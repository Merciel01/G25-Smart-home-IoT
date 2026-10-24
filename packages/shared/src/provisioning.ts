import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { Store } from "./storage.ts";
import { DEVICES } from "./protocol.ts";
const stores = new Map<string, Store>();
export function provisionStore() {
  const database =
    process.env.APP_MODE === "sepolia" ? process.env.DATABASE_URL : undefined;
  if (process.env.APP_MODE === "sepolia" && !database)
    throw Error("PROVISIONING_DATABASE_REQUIRED");
  const key = database ?? "local";
  if (!stores.has(key)) stores.set(key, new Store("provisioning", database));
  return stores.get(key)!;
}
export function sealProvision(
  record: any,
  key = process.env.PROVISIONING_ENCRYPTION_KEY,
) {
  if (
    process.env.APP_MODE === "local" ||
    (!key && process.env.APP_MODE !== "sepolia")
  )
    return record;
  if (!key || !/^[a-fA-F0-9]{64}$/.test(key))
    throw Error("PROVISIONING_ENCRYPTION_KEY_REQUIRED");
  const { privateKey, credentials, ...publicData } = record;
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", Buffer.from(key, "hex"), iv);
  cipher.setAAD(
    Buffer.from(
      record.registry.toLowerCase() +
        "/" +
        record.id +
        "/" +
        record.assignedTo.toLowerCase() +
        "/" +
        record.model,
    ),
  );
  const encrypted = Buffer.concat([
    cipher.update(JSON.stringify({ privateKey, credentials }), "utf8"),
    cipher.final(),
  ]);
  return {
    ...publicData,
    sealed: {
      iv: iv.toString("hex"),
      tag: cipher.getAuthTag().toString("hex"),
      data: encrypted.toString("hex"),
    },
  };
}
export function openProvision(
  record: any,
  key = process.env.PROVISIONING_ENCRYPTION_KEY,
) {
  if (!record.sealed) {
    if (process.env.APP_MODE === "sepolia")
      throw Error("PROVISIONING_PLAINTEXT_FORBIDDEN");
    return record;
  }
  if (!key || !/^[a-fA-F0-9]{64}$/.test(key))
    throw Error("PROVISIONING_ENCRYPTION_KEY_REQUIRED");
  const decipher = createDecipheriv(
    "aes-256-gcm",
    Buffer.from(key, "hex"),
    Buffer.from(record.sealed.iv, "hex"),
  );
  decipher.setAAD(
    Buffer.from(
      record.registry.toLowerCase() +
        "/" +
        record.id +
        "/" +
        record.assignedTo.toLowerCase() +
        "/" +
        record.model,
    ),
  );
  decipher.setAuthTag(Buffer.from(record.sealed.tag, "hex"));
  const secret = JSON.parse(
    Buffer.concat([
      decipher.update(Buffer.from(record.sealed.data, "hex")),
      decipher.final(),
    ]).toString("utf8"),
  );
  return { ...record, ...secret };
}
export async function provisioningRecords(registry: string) {
  const state = await provisionStore().read();
  return Object.values(state.devices ?? {}).filter(
    (d: any) => d.registry.toLowerCase() === registry.toLowerCase(),
  ) as any[];
}
export async function provisioned(registry: string) {
  return (await provisioningRecords(registry))
    .filter((d) => !d.status || d.status === "ready")
    .map((d) => openProvision(d));
}
export async function specifications(registry: string) {
  return [
    ...DEVICES,
    ...(await provisioningRecords(registry)).map((d) => ({
      label: d.label,
      model: d.model,
      name: d.name,
      actions: DEVICES.find((s) => s.model === d.model)!.actions,
      assignedTo: d.assignedTo,
      signer: d.status && d.status !== "ready" ? null : d.signer,
      status: d.status ?? "ready",
    })),
  ];
}
