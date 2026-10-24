import fs from "node:fs/promises";
import { Wallet } from "ethers";
import { DEVICES, deviceId } from "../packages/shared/src/protocol.ts";
const keys = JSON.parse(await fs.readFile(".local/identities.json", "utf8"));
for (const d of DEVICES)
  console.log(d.label, deviceId(d.label), new Wallet(keys[d.label]).address);
