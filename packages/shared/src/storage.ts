import fs from "node:fs/promises";
import path from "node:path";
import pg from "pg";
import { postgresOptions } from "./postgres.ts";
// Each service owns a scope. PostgreSQL row locking makes every mutation atomic.
// Local mode is explicitly a single-process, atomic-file fallback.
export class Store {
  pool?: pg.Pool;
  private queue: Promise<unknown> = Promise.resolve();
  constructor(
    public scope: string,
    public url?: string,
    public directory = ".local",
  ) {
    if (url) this.pool = new pg.Pool({ ...postgresOptions(url), max: 5 });
  }
  async init() {
    if (this.pool)
      await this.pool.query(
        await fs.readFile(
          "apps/gateway/migrations/001_service_state.sql",
          "utf8",
        ),
      );
    else await fs.mkdir(this.directory, { recursive: true, mode: 0o700 });
  }
  async read(): Promise<any> {
    if (this.pool)
      return (
        (
          await this.pool.query(
            "SELECT document FROM service_state WHERE scope=$1",
            [this.scope],
          )
        ).rows[0]?.document ?? {}
      );
    try {
      return JSON.parse(
        await fs.readFile(
          path.join(this.directory, this.scope + ".json"),
          "utf8",
        ),
      );
    } catch (e: any) {
      if (e.code === "ENOENT") return {};
      throw e;
    }
  }
  async mutate<T>(fn: (data: any) => T | Promise<T>): Promise<T> {
    const task = this.queue.then(async () => {
      if (this.pool) {
        const c = await this.pool.connect();
        try {
          await c.query("BEGIN");
          await c.query(
            "INSERT INTO service_state VALUES($1,$2) ON CONFLICT DO NOTHING",
            [this.scope, {}],
          );
          const s = (
            await c.query(
              "SELECT document FROM service_state WHERE scope=$1 FOR UPDATE",
              [this.scope],
            )
          ).rows[0].document;
          const result = await fn(s);
          await c.query("UPDATE service_state SET document=$2 WHERE scope=$1", [
            this.scope,
            s,
          ]);
          await c.query("COMMIT");
          return result;
        } catch (e) {
          await c.query("ROLLBACK");
          throw e;
        } finally {
          c.release();
        }
      }
      const s = await this.read();
      const result = await fn(s);
      const file = path.join(this.directory, this.scope + ".json");
      const handle = await fs.open(file + ".tmp", "w", 0o600);
      try {
        await handle.writeFile(JSON.stringify(s));
        await handle.sync();
      } finally {
        await handle.close();
      }
      await fs.rename(file + ".tmp", file);
      return result;
    });
    this.queue = task.catch(() => {});
    return task;
  }
  async close() {
    await this.queue;
    await this.pool?.end();
  }
}
