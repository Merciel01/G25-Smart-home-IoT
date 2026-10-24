import "dotenv/config";
import { randomBytes } from "node:crypto";
import fs from "node:fs/promises";
import { externalBroker } from "../packages/shared/src/external-broker.ts";
import {
  provisionStore,
  provisioningRecords,
  openProvision,
} from "../packages/shared/src/provisioning.ts";
const action = process.argv[2] ?? "check";
if (action === "key") {
  await fs.mkdir(".local/external", { recursive: true, mode: 0o700 });
  await fs.writeFile(
    ".local/external/provisioning-key.secret",
    randomBytes(32).toString("hex"),
    { mode: 0o600, flag: "wx" },
  );
  console.log(
    "Clé générée dans .local/external/provisioning-key.secret (privé). Ne pas publier ce fichier.",
  );
} else {
  const required = [
    "BROKER_PROVISIONING_DRIVER",
    "BROKER_API_URL",
    "BROKER_API_KEY",
    "BROKER_API_SECRET",
    "MQTT_PREFIX",
  ];
  if (action === "retry")
    required.push(
      "APP_MODE",
      "DATABASE_URL",
      "PROVISIONING_ENCRYPTION_KEY",
      "REGISTRY_ADDRESS",
    );
  const missing = required.filter((name) => !process.env[name]);
  if (missing.length) {
    console.error("Configuration manquante : " + missing.join(", "));
    process.exitCode = 1;
  } else
    try {
      const broker = externalBroker();
      if (action === "check") {
        await broker.checkConfiguration();
        console.log(
          "Configuration de gestion EMQX vérifiée ; transport MQTT et ACL effectives encore à tester.",
        );
      } else if (action === "gateway") {
        await broker.ensureDevice(
          {
            id: "",
            credentials: {
              username: process.env.MQTT_USERNAME ?? "",
              password: process.env.MQTT_PASSWORD ?? "",
            },
          },
          true,
        );
        console.log(
          "Identité passerelle et ACL configurées. Vérifier ensuite le transport MQTT TLS.",
        );
      } else if (action === "retry") {
        if (process.env.APP_MODE !== "sepolia")
          throw Error("Mode Sepolia requis pour la reprise externe");
        const store = provisionStore();
        await store.init();
        try {
          for (const record of await provisioningRecords(
            process.env.REGISTRY_ADDRESS!,
          )) {
            if (record.status === "ready") continue;
            await broker.ensureDevice(openProvision(record));
            await store.mutate((s) => {
              s.devices[record.id].status = "ready";
            });
            console.log("Identité MQTT prête : " + record.id);
          }
        } finally {
          await store.close();
        }
      } else throw Error("Action invalide : check, key, gateway ou retry");
    } catch (error: any) {
      console.error(
        /^BROKER_[A-Z_0-9]+$/.test(error.message)
          ? error.message
          : "Échec du contrôle ou provisionnement externe ; vérifier la configuration privée.",
      );
      process.exitCode = 1;
    }
}
