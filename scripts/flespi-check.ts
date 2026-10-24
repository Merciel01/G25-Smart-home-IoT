import dotenv from "dotenv";
import fs from "node:fs/promises";
import { randomBytes } from "node:crypto";
import mqtt from "mqtt";
import {
  FlespiBroker,
  flespiProbePrefix,
} from "../packages/shared/src/flespi-broker.ts";
dotenv.config({ path: ".local/external/flespi.env", quiet: true });
// Never inherit the live installation prefix: cleanup must not touch its gateway.
const prefix = flespiProbePrefix();
const broker = new FlespiBroker(process.env.FLESPI_TOKEN ?? "", prefix);
const clients: mqtt.MqttClient[] = [];
const tokens: { id: string; tokenId: number }[] = [];
function bounded<T>(promise: Promise<T>) {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(Error("FLESPI_TEST_TIMEOUT")), 8000);
    promise.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e) => {
        clearTimeout(timer);
        reject(e);
      },
    );
  });
}
async function connect(credentials: { username: string; password: string }) {
  const client = mqtt.connect("mqtts://mqtt.flespi.io:8883", {
    ...credentials,
    protocolVersion: 5,
    rejectUnauthorized: true,
    reconnectPeriod: 0,
    connectTimeout: 5000,
    clientId: "g25-probe-" + randomBytes(12).toString("hex"),
  });
  clients.push(client);
  client.on("error", () => {});
  await bounded(
    new Promise<void>((resolve, reject) => {
      client.once("connect", () => resolve());
      client.once("error", () =>
        reject(Error("FLESPI_MQTT_CONNECTION_FAILED")),
      );
    }),
  );
  return client;
}
try {
  await broker.checkConfiguration();
  console.log(
    "Jeton de gestion valide, droits Maître confirmés (valeur non affichée).",
  );
  if (process.argv.includes("--transport")) {
    const id = "0x" + randomBytes(32).toString("hex");
    const prepared = await broker.ensureDevice({ id });
    tokens.push({ id, tokenId: prepared.remoteTokenId });
    const repeated = await broker.ensureDevice({ id });
    if (repeated.remoteTokenId !== prepared.remoteTokenId)
      throw Error("FLESPI_RETRY_NOT_IDEMPOTENT");
    const client = await connect(prepared.credentials);
    const topic = `${prefix}/${id}/commands`;
    const grants = await bounded(client.subscribeAsync(topic, { qos: 1 }));
    if (grants[0].qos !== 1) throw Error("FLESPI_OWN_TOPIC_DENIED");
    await bounded(
      client.publishAsync(
        `${prefix}/${id}/status`,
        JSON.stringify({ probe: true }),
        { qos: 1, retain: false },
      ),
    );
    const gate = await broker.ensureDevice({ id: "" }, true);
    tokens.push({ id: "gateway", tokenId: gate.remoteTokenId });
    const publisher = await connect(gate.credentials);
    const received: string[] = [];
    client.on("message", (topic) => received.push(topic));
    const foreign = `${prefix}/0x${"00".repeat(32)}/commands`;
    let rejectedSubscription = false;
    try {
      const result = await bounded(client.subscribeAsync(foreign, { qos: 1 }));
      rejectedSubscription = Number(result[0]?.qos) >= 128;
    } catch {
      rejectedSubscription = true;
    }
    // flespi may accept SUBSCRIBE but filter unauthorized deliveries. Test data,
    // not merely SUBACK, and use allowed messages as connectivity controls.
    await bounded(
      publisher.publishAsync(topic, "control-1", { qos: 1, retain: false }),
    );
    await bounded(
      publisher.publishAsync(foreign, "forbidden-probe", {
        qos: 1,
        retain: false,
      }),
    );
    await bounded(
      publisher.publishAsync(topic, "control-2", { qos: 1, retain: false }),
    );
    await bounded(
      new Promise<void>((resolve) => {
        const timer = setInterval(() => {
          if (received.filter((v) => v === topic).length >= 2) {
            clearInterval(timer);
            resolve();
          }
        }, 25);
        setTimeout(() => clearInterval(timer), 7500).unref();
      }),
    );
    await new Promise((resolve) => setTimeout(resolve, 1500));
    if (received.includes(foreign)) throw Error("FLESPI_CROSS_TOPIC_DELIVERED");
    const statuses: string[] = [];
    publisher.on("message", (topic) => statuses.push(topic));
    await bounded(publisher.subscribeAsync(`${prefix}/+/status`, { qos: 1 }));
    await bounded(
      client.publishAsync(`${prefix}/${id}/status`, "own-status", {
        qos: 1,
        retain: false,
      }),
    );
    try {
      await bounded(
        client.publishAsync(
          `${prefix}/0x${"00".repeat(32)}/status`,
          "forbidden-status",
          { qos: 1, retain: false },
        ),
      );
    } catch {
      /* An explicit broker refusal is valid; delivery is still checked. */
    }
    await bounded(
      new Promise<void>((resolve) => {
        const timer = setInterval(() => {
          if (statuses.includes(`${prefix}/${id}/status`)) {
            clearInterval(timer);
            resolve();
          }
        }, 25);
        setTimeout(() => clearInterval(timer), 7500).unref();
      }),
    );
    await new Promise((resolve) => setTimeout(resolve, 1500));
    if (statuses.includes(`${prefix}/0x${"00".repeat(32)}/status`))
      throw Error("FLESPI_CROSS_PUBLICATION_DELIVERED");
    await fs.writeFile(
      "docs/preuve-flespi-transport.json",
      JSON.stringify(
        {
          broker: "mqtt.flespi.io:8883",
          tls: true,
          checks: [
            "création jeton ACL restreint",
            "relecture des ACL",
            "reprise sans duplication",
            "connexion MQTT TLS",
            "souscription propre",
            "publication statut autorisée",
            "aucune livraison de commande croisée, contrôles autorisés reçus",
            "publication croisée non livrée au témoin passerelle",
          ],
          note: "Pas une transaction blockchain ni une preuve de déploiement Sepolia",
        },
        null,
        2,
      ),
    );
    console.log(
      "Transport réel : TLS, ACL, livraison propre, isolation des livraisons lecture/écriture et reprise vérifiés.",
    );
  }
} catch (error: any) {
  console.error(
    /^[A-Z_0-9]+$/.test(error.message)
      ? error.message
      : "Contrôle flespi non concluant (détails secrets non affichés).",
  );
  process.exitCode = 1;
} finally {
  await Promise.all(clients.map((c) => c.endAsync(true)));
  for (const token of tokens)
    try {
      await broker.removeDeviceToken(token.id, token.tokenId);
    } catch {
      console.error(
        "Nettoyage de sonde non confirmé, id public : " + token.tokenId,
      );
      process.exitCode = 1;
    }
}
