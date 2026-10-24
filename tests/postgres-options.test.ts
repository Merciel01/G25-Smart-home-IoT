import { test } from "node:test";
import assert from "node:assert/strict";
import { postgresOptions } from "../packages/shared/src/postgres.ts";
test("PostgreSQL : les paramètres URL ne désactivent pas la vérification TLS", () => {
  const options = postgresOptions(
    "postgresql://test:example@db.invalid/app?ssl=false&sslmode=disable&sslrootcert=ignored&channel_binding=disable",
  );
  const url = new URL(options.connectionString);
  assert.equal(url.searchParams.has("ssl"), false);
  assert.equal(url.searchParams.has("sslmode"), false);
  assert.equal(url.searchParams.has("sslrootcert"), false);
  assert.equal(options.ssl.rejectUnauthorized, true);
  assert.equal(options.enableChannelBinding, true);
});
test("PostgreSQL : protocoles non PostgreSQL refusés", () => {
  assert.throws(
    () => postgresOptions("https://db.invalid/app"),
    /POSTGRES_URL_INVALID/,
  );
});
