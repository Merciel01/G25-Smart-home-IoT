import "dotenv/config";
import fs from "node:fs/promises";
import { randomBytes } from "node:crypto";
import mqtt from "mqtt";
import { externalBroker } from "../packages/shared/src/external-broker.ts";
const names = [
  "BROKER_API_URL",
  "BROKER_API_KEY",
  "BROKER_API_SECRET",
  "BROKER_PROVISIONING_DRIVER",
  "MQTT_URL",
  "MQTT_PREFIX",
];
const missing = names.filter((name) => !process.env[name]);
if (missing.length) {
  console.error("Configuration manquante : " + missing.join(", "));
  process.exitCode = 1;
} else {
  const broker = externalBroker();
  if (!("removeProbe" in broker)) throw Error("EMQX_DRIVER_REQUIRED");
  const device = {
    id: "0x" + randomBytes(32).toString("hex"),
    credentials: {
      username: "probe-" + randomBytes(16).toString("hex"),
      password: randomBytes(32).toString("hex"),
    },
  };
  const clients: mqtt.MqttClient[] = [];
  function bounded<T>(promise: Promise<T>) {
    return Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        const timer = setTimeout(
          () => reject(Error("TRANSPORT_TIMEOUT")),
          8000,
        );
        timer.unref();
      }),
    ]);
  }
  const url = process.env.MQTT_URL!;

  try {
    if (
      !url.startsWith("mqtts://") ||
      new URL(url).username ||
      new URL(url).password
    )
      throw Error("MQTT_TLS_REQUIRED");
    const options = {
      protocolVersion: 5 as const,
      rejectUnauthorized: true,
      reconnectPeriod: 0,
      connectTimeout: 5000,
      ...(process.env.MQTT_CA_FILE
        ? { ca: await fs.readFile(process.env.MQTT_CA_FILE) }
        : {}),
    };
    // No Ethereum signing key or chain transaction is involved in this probe.
    await broker.ensureDevice(device);

    const anonymous = mqtt.connect(url, options);
    clients.push(anonymous);
    const deniedAnonymous = await bounded(
      new Promise<boolean>((resolve) => {
        anonymous.once("connect", () => resolve(false));
        anonymous.once("error", (e: any) =>
          resolve([4, 5, 134, 135].includes(e.code)),
        );
      }),
    );
    if (!deniedAnonymous) throw Error("ANONYMOUS_NOT_REFUSED");
    await anonymous.endAsync(true);
    const client = mqtt.connect(url, { ...options, ...device.credentials });
    clients.push(client);
    await bounded(
      new Promise<void>((resolve, reject) => {
        client.once("connect", () => resolve());
        client.once("error", reject);
      }),
    );
    client.on("error", () => {});
    const own = `${process.env.MQTT_PREFIX}/${device.id}/commands`;
    const granted = await bounded(client.subscribeAsync(own, { qos: 1 }));
    if (granted[0].qos !== 1) throw Error("OWN_TOPIC_NOT_ALLOWED");
    const denied = await bounded(
      new Promise<boolean>((resolve) => {
        client.once("disconnect", (packet) =>
          resolve(packet.reasonCode === 135),
        );
        client.subscribe(
          `${process.env.MQTT_PREFIX}/0x${"00".repeat(32)}/commands`,
          { qos: 1 },
          (error, grants) =>
            resolve(
              [128, 135].includes(Number((error as any)?.code)) ||
                Number(grants?.[0]?.qos) >= 128,
            ),
        );
      }),
    );
    if (!denied) throw Error("CROSS_TOPIC_NOT_REFUSED");
    console.log(
      "Transport EMQX : TLS, refus anonyme, lecture propre et refus de lecture croisée vérifiés. Publication croisée et retained restent à vérifier séparément.",
    );
  } catch (error: any) {
    console.error(
      /^[A-Z_0-9]+$/.test(error.message)
        ? error.message
        : "Contrôle transport externe non concluant ; vérifier TLS, accès et ACL.",
    );
    process.exitCode = 1;
  } finally {
    await Promise.all(clients.map((client) => client.endAsync(true)));
    // Cleanup even after a partial management failure; only this random probe identity.
    try {
      await broker.removeProbe(device.credentials.username);
    } catch {
      console.error(
        "Nettoyage de l’identité de sonde non confirmé : " +
          device.credentials.username,
      );
      process.exitCode = 1;
    }
  }
}
