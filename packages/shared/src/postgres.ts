/** Keep URL aliases from overriding certificate verification in node-postgres. */
export function postgresOptions(connectionString: string) {
  const url = new URL(connectionString);
  if (!["postgres:", "postgresql:"].includes(url.protocol))
    throw Error("POSTGRES_URL_INVALID");
  for (const name of [
    "ssl",
    "sslmode",
    "sslrootcert",
    "sslcert",
    "sslkey",
    "sslpassword",
    "channel_binding",
  ])
    url.searchParams.delete(name);
  return {
    connectionString: url.href,
    ssl: { rejectUnauthorized: true },
    enableChannelBinding: true,
    connectionTimeoutMillis: 30000,
    query_timeout: 15000,
  };
}
