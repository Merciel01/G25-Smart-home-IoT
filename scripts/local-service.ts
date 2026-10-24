import fs from "node:fs/promises";
const env = JSON.parse(await fs.readFile(".local/runtime.json", "utf8"));
Object.assign(process.env, env);
const service = process.argv[2];
if (service !== "gateway") {
  for (const name of ["FLESPI_TOKEN", "BROKER_API_KEY", "BROKER_API_SECRET"])
    delete process.env[name];
}
if (service === "gateway") await import("../apps/gateway/src/main.ts");
else if (service === "simulator") await import("../apps/simulator/src/main.ts");
else if (service === "broker") await import("./mqtt-broker.ts");
else throw Error("Service inconnu");
