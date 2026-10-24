import { DEVICES, deviceId } from "../packages/shared/src/protocol.ts";
const prefix = process.env.MQTT_PREFIX ?? "g25/home01";
if (!/^[A-Za-z0-9/_-]+$/.test(prefix)) throw Error("Préfixe MQTT invalide");
console.log(
  `user gateway\ntopic write ${prefix}/+/commands\ntopic read ${prefix}/+/acks\ntopic read ${prefix}/+/status\n`,
);
for (const d of DEVICES)
  console.log(
    `user ${d.label}\ntopic read ${prefix}/${deviceId(d.label)}/commands\ntopic write ${prefix}/${deviceId(d.label)}/acks\ntopic write ${prefix}/${deviceId(d.label)}/status\n`,
  );
