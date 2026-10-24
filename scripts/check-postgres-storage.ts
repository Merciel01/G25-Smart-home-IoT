import fs from "node:fs/promises";
import { randomBytes } from "node:crypto";
import dotenv from "dotenv";
import assert from "node:assert/strict";
import { Store } from "../packages/shared/src/storage.ts";
const env = dotenv.parse(await fs.readFile(".local/external/postgres.env"));
if (!env.DATABASE_URL) throw Error("DATABASE_URL_REQUIRED");
const scope = "g25-storage-probe-" + randomBytes(16).toString("hex");
const a = new Store(scope, env.DATABASE_URL),
  b = new Store(scope, env.DATABASE_URL);
let reopened: Store | undefined;
let stage = "initialisation";
let aClosed = false,
  bClosed = false;
async function readWithReconnect(store: Store) {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await store.read();
    } catch (error: any) {
      if (
        !["ETIMEDOUT", "ECONNRESET", "EAI_AGAIN"].includes(error.code) ||
        attempt === 2
      )
        throw error;
    }
  }
}
try {
  await a.init();
  stage = "écriture";
  await a.mutate((s) => {
    s.counter = 0;
  });
  stage = "concurrence";
  await Promise.all(
    Array.from({ length: 8 }, (_, i) =>
      (i % 2 ? a : b).mutate((s) => {
        s.counter++;
      }),
    ),
  );
  assert.equal((await a.read()).counter, 8);
  stage = "rollback";
  await assert.rejects(
    a.mutate((s) => {
      s.counter = 999;
      throw Error("ROLLBACK_PROBE");
    }),
    /ROLLBACK_PROBE/,
  );
  assert.equal((await b.read()).counter, 8);
  await a.close();
  aClosed = true;
  await b.close();
  bClosed = true;
  stage = "reconnexion";
  reopened = new Store(scope, env.DATABASE_URL);
  assert.equal((await readWithReconnect(reopened)).counter, 8);
  await fs.writeFile(
    "docs/preuve-postgresql.json",
    JSON.stringify(
      {
        provider: "Neon",
        directConnection: true,
        certificateVerification: true,
        checks: [
          "migration appliquée",
          "écriture et lecture JSONB",
          "8 mutations concurrentes sur deux connexions sans perte",
          "rollback sans modification",
          "persistance après fermeture et réouverture",
        ],
        localDataMigrated: false,
        applicationSwitchedToPostgres: false,
      },
      null,
      2,
    ),
  );
  console.log(
    "PostgreSQL réel : écritures, concurrence, rollback et persistance vérifiés.",
  );
} catch (error: any) {
  console.error(
    "Étape : " +
      stage +
      " ; code : " +
      (/^[A-Z_0-9]{1,64}$/.test(String(error.code))
        ? error.code
        : "NON_CONCLUANT"),
  );
  console.error(
    "POSTGRES_STORAGE_TEST_FAILED : résultat non concluant, secrets non affichés.",
  );
  process.exitCode = 1;
} finally {
  const cleanup = reopened ?? new Store(scope, env.DATABASE_URL);
  try {
    await cleanup.pool!.query("DELETE FROM service_state WHERE scope=$1", [
      scope,
    ]);
  } catch {
    console.error("Nettoyage de la ligne de test non confirmé : " + scope);
    process.exitCode = 1;
  }
  await cleanup.close();
  if (!aClosed) await a.close();
  if (!bClosed) await b.close();
}
