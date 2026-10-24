import aedes from "aedes";
import tls from "node:tls";
import fs from "node:fs";
import { timingSafeEqual } from "node:crypto";
import { required } from "../packages/shared/src/config.ts";
if (process.env.APP_MODE !== "local")
  throw Error("Broker de développement exclusivement local");
const broker = new aedes();
const initialCredentials: any = JSON.parse(
  required("DEVICE_MQTT_CREDENTIALS_JSON"),
);
function credentials(): any {
  try {
    const state = JSON.parse(
      fs.readFileSync(".local/provisioning.json", "utf8"),
    );
    return {
      ...initialCredentials,
      ...Object.fromEntries(
        Object.values(state.devices ?? {})
          .filter(
            (d: any) =>
              d.registry.toLowerCase() ===
              required("REGISTRY_ADDRESS").toLowerCase(),
          )
          .map((d: any) => [d.id, d.credentials]),
      ),
    };
  } catch {
    return initialCredentials;
  }
}
const prefix = process.env.MQTT_PREFIX ?? "g25/home01";
const equal = (a: string, b: string) => {
  const x = Buffer.from(a),
    y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
};
function deviceTopic(
  username: string,
  topic: string,
  direction: "read" | "write",
) {
  for (const [id, v] of Object.entries(credentials()) as any)
    if (v.username === username)
      return direction === "read"
        ? topic === `${prefix}/${id}/commands`
        : [`${prefix}/${id}/acks`, `${prefix}/${id}/status`].includes(topic);
  return false;
}
broker.authenticate = (client, username, password, cb) => {
  const name = String(username ?? "");
  const expected =
    name === "gateway"
      ? required("MQTT_PASSWORD")
      : (Object.values(credentials()) as any[]).find((v) => v.username === name)
          ?.password;
  const ok = !!expected && equal(String(password ?? ""), expected);
  if (ok) (client as any).username = name;
  cb(null, ok);
};
broker.authorizePublish = (client, packet, cb) => {
  if (!client) {
    cb(null);
    return;
  }
  const name = (client as any).username;
  const ok =
    !packet.retain &&
    (name === "gateway"
      ? new RegExp("^" + prefix + "/0x[0-9a-f]{64}/commands$").test(
          packet.topic,
        )
      : deviceTopic(name, packet.topic, "write"));
  cb(ok ? null : new Error("ACL_DENIED"));
};
broker.authorizeSubscribe = (client, sub, cb) => {
  const name = (client as any).username;
  const ok =
    name === "gateway"
      ? [`${prefix}/+/acks`, `${prefix}/+/status`].includes(sub.topic)
      : deviceTopic(name, sub.topic, "read");
  cb(ok ? null : new Error("ACL_DENIED"), ok ? sub : null);
};
const server = tls.createServer(
  {
    key: fs.readFileSync(".local/tls/key.pem"),
    cert: fs.readFileSync(".local/tls/cert.pem"),
    minVersion: "TLSv1.2",
  },
  broker.handle,
);
server.listen(8883, "127.0.0.1", () =>
  console.log("MQTT TLS local authentifié : 8883"),
);
process.on("SIGTERM", () => {
  server.close();
  broker.close();
});
