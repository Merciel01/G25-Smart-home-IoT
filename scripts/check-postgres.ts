import fs from "node:fs/promises";
import dotenv from "dotenv";
import pg from "pg";
import { postgresOptions } from "../packages/shared/src/postgres.ts";
const env = dotenv.parse(await fs.readFile(".local/external/postgres.env"));
if (!env.DATABASE_URL) {
  console.error("DATABASE_URL manquante dans le fichier privé postgres.env");
  process.exitCode = 1;
} else {
  let pool: pg.Pool | undefined;
  let stage = "configuration";
  try {
    const url = new URL(env.DATABASE_URL);
    if (
      !["postgres:", "postgresql:"].includes(url.protocol) ||
      !url.hostname.endsWith(".neon.tech")
    )
      throw Error("Neon direct endpoint required");
    if (url.hostname.includes("-pooler")) throw Error("Use direct connection");
    stage = "connexion";
    pool = new pg.Pool({ ...postgresOptions(env.DATABASE_URL), max: 1 });
    const connection = await pool.connect();
    try {
      stage = "TLS";
      const socket = (connection as any).connection.stream;
      if (socket.encrypted !== true || socket.authorized !== true)
        throw Error("TLS not confirmed");
      stage = "requête";
      await connection.query("SELECT 1");
    } finally {
      connection.release();
    }
    console.log(
      "PostgreSQL Neon : connexion directe et TLS vérifié confirmés. URL et mot de passe non affichés.",
    );
    if (process.argv.includes("--migrate")) {
      stage = "migration";
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        await client.query(
          await fs.readFile(
            "apps/gateway/migrations/001_service_state.sql",
            "utf8",
          ),
        );
        await client.query("COMMIT");
        console.log(
          "Migration du schéma SmartHome appliquée. Aucune donnée locale transférée.",
        );
      } catch {
        await client.query("ROLLBACK");
        throw Error("Migration failed");
      } finally {
        client.release();
      }
    }
  } catch (error: any) {
    const code = /^[A-Z_0-9]{1,64}$/.test(String(error.code))
      ? error.code
      : "NON_CONCLUANT";
    console.error("Étape : " + stage + " ; code : " + code);
    console.error(
      "Contrôle PostgreSQL non concluant. Vérifier URL directe Neon, accès et certificat ; aucun secret affiché.",
    );
    process.exitCode = 1;
  } finally {
    await pool?.end();
  }
}
