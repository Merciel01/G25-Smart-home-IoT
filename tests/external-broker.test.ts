import { test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { ExternalBroker } from "../packages/shared/src/external-broker.ts";
import {
  sealProvision,
  openProvision,
} from "../packages/shared/src/provisioning.ts";
const device = {
  id: "0x" + "ab".repeat(32),
  credentials: { username: "device-test", password: "p".repeat(64) },
};
function fixture(
  options: { badAuth?: boolean; badAcl?: boolean; failUser?: boolean } = {},
) {
  const operations: string[] = [];
  let rules: any = null,
    user: any = null;
  let failures = options.failUser ? 1 : 0;
  const request = (async (url: any, init: any) => {
    const path = new URL(String(url)).pathname;
    const method = init.method;
    operations.push(method + " " + path);
    assert.equal(init.redirect, "error");
    assert.equal(
      init.headers.Authorization,
      "Basic " + Buffer.from("test-key:test-secret").toString("base64"),
    );
    if (path.endsWith("/authentication"))
      return Response.json([
        {
          id: "password_based:built_in_database",
          user_id_type: options.badAuth ? "clientid" : "username",
          enable: true,
        },
      ]);
    if (path.endsWith("/authorization/sources"))
      return Response.json({
        sources: [{ type: "built_in_database", enable: true }],
      });
    if (path.endsWith("/authorization/settings"))
      return Response.json({ no_match: "deny" });
    const body = init.body ? JSON.parse(init.body) : null;
    if (path.includes("/rules/users")) {
      if (method === "GET")
        return rules
          ? Response.json({ rules: options.badAcl ? [] : rules })
          : new Response(null, { status: 404 });
      if (method === "DELETE") {
        rules = null;
        return new Response(null, { status: 204 });
      }
      rules = (Array.isArray(body) ? body[0] : body).rules;
      return new Response(null, { status: 204 });
    }
    if (path.includes("/authentication/")) {
      if (method === "DELETE") {
        user = null;
        return new Response(null, { status: 204 });
      }
      if (method === "GET")
        return user ? Response.json(user) : new Response(null, { status: 404 });
      if (failures-- > 0)
        return new Response("private response including secret", {
          status: 503,
        });
      user = {
        user_id: device.credentials.username,
        is_superuser: body.is_superuser,
      };
      return new Response(null, { status: 204 });
    }
    throw Error("Unexpected test endpoint " + path);
  }) as typeof fetch;
  return {
    broker: new ExternalBroker(
      "https://broker.invalid",
      "test-key",
      "test-secret",
      "g25/home01",
      request,
    ),
    operations,
  };
}
test("EMQX : ACL exactes avant utilisateur, vérification et reprise idempotente", async () => {
  const { broker, operations } = fixture();
  await broker.ensureDevice(device);
  const aclWrite = operations.findIndex(
    (v) => v.startsWith("POST") && v.includes("/rules/users"),
  );
  const userWrite = operations.findIndex(
    (v) => v.startsWith("POST") && v.includes("/authentication/"),
  );
  assert.ok(aclWrite >= 0 && aclWrite < userWrite);
  await broker.ensureDevice(device);
  assert.ok(
    operations.some((v) => v.startsWith("PUT") && v.includes("/rules/users/")),
  );
  await assert.rejects(broker.removeProbe("device-test"), /PROBE_ID_INVALID/);
  await broker.removeProbe("probe-" + "aa".repeat(16));
  assert.equal(operations.filter((v) => v.startsWith("DELETE")).length, 2);
  const rules = broker.rules(device.id);
  assert.equal(rules[0].topic, `eq g25/home01/${device.id}/commands`);
  assert.equal(rules[1].retain, "false");
  assert.deepEqual(rules.at(-1), {
    permission: "deny",
    action: "all",
    topic: "#",
  });
});
test("EMQX : reprise après échec partiel sans recréer l’identité", async () => {
  const { broker } = fixture({ failUser: true });
  await assert.rejects(
    broker.ensureDevice(device),
    /BROKER_MANAGEMENT_HTTP_503/,
  );
  await broker.ensureDevice(device);
});
test("EMQX : mauvaise authentification ou ACL non confirmées bloquent l’activation", async () => {
  const f = fixture({ badAuth: true });
  await assert.rejects(
    f.broker.ensureDevice(device),
    /AUTHENTICATION_CONFIGURATION_REQUIRED/,
  );
  assert.equal(
    f.operations.some((v) => v.startsWith("POST")),
    false,
  );
  await assert.rejects(
    fixture({ badAcl: true }).broker.ensureDevice(device),
    /NOT_CONFIRMED/,
  );
});
test("EMQX : HTTPS et données valides requis, erreur réseau sans secret", async () => {
  assert.throws(
    () => new ExternalBroker("http://broker.invalid", "k", "s", "p"),
    /CONFIGURATION_INVALID/,
  );
  const broker = new ExternalBroker(
    "https://broker.invalid",
    "k",
    "secret",
    "p",
    (async () => {
      throw Error("secret private URL");
    }) as typeof fetch,
  );
  await assert.rejects(broker.ensureDevice(device), {
    message: "BROKER_MANAGEMENT_UNAVAILABLE",
  });
});
test("Secrets : chiffrement authentifié, identité et compte liés, altération refusée", () => {
  const key = randomBytes(32).toString("hex");
  const record = {
    registry: "0x" + "11".repeat(20),
    assignedTo: "0x" + "22".repeat(20),
    model: "G25-LOCK",
    id: device.id,
    privateKey: "private-test-key",
    credentials: device.credentials,
  };
  const previousMode = process.env.APP_MODE;
  process.env.APP_MODE = "sepolia";
  try {
    const sealed = sealProvision(record, key);
    assert.equal(JSON.stringify(sealed).includes(record.privateKey), false);
    assert.equal(
      JSON.stringify(sealed).includes(device.credentials.password),
      false,
    );
    assert.equal(openProvision(sealed, key).privateKey, record.privateKey);
    assert.throws(() =>
      openProvision({ ...sealed, assignedTo: "0x" + "33".repeat(20) }, key),
    );
    assert.throws(() => openProvision(sealed, randomBytes(32).toString("hex")));
    assert.throws(() => openProvision(record, key), /PLAINTEXT_FORBIDDEN/);
    assert.throws(() => sealProvision(record, ""), /ENCRYPTION_KEY_REQUIRED/);
  } finally {
    if (previousMode === undefined) delete process.env.APP_MODE;
    else process.env.APP_MODE = previousMode;
  }
});
