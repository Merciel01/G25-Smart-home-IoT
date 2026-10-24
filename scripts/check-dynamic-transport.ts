import fs from "node:fs/promises";
import assert from "node:assert/strict";
import mqtt from "mqtt";
import { deviceId } from "../packages/shared/src/protocol.ts";
const env = JSON.parse(await fs.readFile(".local/runtime.json", "utf8"));
if (env.APP_MODE !== "local") throw Error("Essai strictement local");
if (env.BROKER_PROVISIONING_DRIVER === "flespi") {
  if (!process.argv.includes("--transport")) process.argv.push("--transport");
  await import("./flespi-check.ts");
} else {
  const ca = await fs.readFile(env.MQTT_CA_FILE);
  const provisioning = JSON.parse(
    await fs.readFile(".local/provisioning.json", "utf8"),
  );
  const dynamic = Object.values(provisioning.devices).filter(
    (d: any) => d.registry.toLowerCase() === env.REGISTRY_ADDRESS.toLowerCase(),
  ) as any[];
  if (!dynamic.length)
    throw Error("Provisionner un appareil dynamique avant ce test");
  const credentials = Object.fromEntries(
    dynamic.map((d) => [d.id, d.credentials]),
  );
  const options = {
    ca,
    rejectUnauthorized: true,
    reconnectPeriod: 0,
    connectTimeout: 2500,
  };
  function timeout<T>(p: Promise<T>, ms = 4000) {
    return new Promise<T>((resolve, reject) => {
      const t = setTimeout(() => reject(Error("TIMEOUT_NON_CONCLUANT")), ms);
      p.then(
        (v) => {
          clearTimeout(t);
          resolve(v);
        },
        (e) => {
          clearTimeout(t);
          reject(e);
        },
      );
    });
  }
  const anonymous = mqtt.connect(env.MQTT_URL, options);
  const refusal = await timeout(
    new Promise<number>((resolve) => {
      anonymous.once("error", (e: any) => resolve(e.code));
      anonymous.once("connect", () => resolve(0));
    }),
  );
  assert.equal(refusal, 5);
  await anonymous.endAsync(true);
  const lock = dynamic[0].id,
    plug = deviceId("LOCK-01");
  const client = mqtt.connect(env.MQTT_URL, {
    ...options,
    ...credentials[lock],
  });
  await timeout(
    new Promise<void>((resolve, reject) => {
      client.once("connect", () => resolve());
      client.once("error", reject);
    }),
  );
  client.on("error", () => {});
  const granted = await client.subscribeAsync(
    `${env.MQTT_PREFIX}/${lock}/commands`,
    { qos: 1 },
  );
  assert.equal(granted[0].qos, 1);
  const unauthorized = await timeout(
    new Promise<boolean>((resolve) => {
      client.once("close", () => resolve(true));
      client.subscribe(
        `${env.MQTT_PREFIX}/${plug}/commands`,
        { qos: 1 },
        (error, grants) => resolve(!!error || grants?.[0]?.qos === 128),
      );
    }),
  );
  assert.equal(unauthorized, true);
  await client.endAsync(true);
  await fs.writeFile(
    "docs/preuve-transport-dynamique-local.json",
    JSON.stringify(
      {
        executedAt: new Date().toISOString(),
        transport: "MQTT TLS local, certificat vérifié",
        checks: [
          { test: "connexion anonyme", result: "refusée", mqttCode: refusal },
          { test: "objet lit son sujet", result: "autorisé", qos: 1 },
          { test: "objet lit le sujet d’un autre objet", result: "refusé" },
        ],
      },
      null,
      2,
    ),
  );
  console.log(
    "MQTT TLS : authentification et isolation de souscription vérifiées.",
  );
}
