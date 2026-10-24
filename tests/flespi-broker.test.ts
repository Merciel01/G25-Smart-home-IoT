import { test } from "node:test";
import assert from "node:assert/strict";
import {
  FlespiBroker,
  flespiProbePrefix,
} from "../packages/shared/src/flespi-broker.ts";
const id = "0x" + "12".repeat(32);
function fixture(unsafe = false) {
  let token: any = null;
  let creations = 0;
  const request = (async (url: any, init: any) => {
    const u = new URL(String(url));
    assert.equal(u.origin, "https://flespi.io");
    assert.equal(init.redirect, "error");
    if (u.pathname === "/auth/info")
      return Response.json({ result: [{ access: { type: 1 }, cid: 42 }] });
    if (u.pathname === "/platform/tokens/all")
      return Response.json({
        result: token ? [{ id: token.id, info: token.info }] : [],
      });
    if (init.method === "POST") {
      const body = JSON.parse(init.body);
      assert.ok(Array.isArray(body));
      assert.equal(body[0].access.type, 2);
      assert.deepEqual(body[0].origins, []);
      token = { ...body[0], id: 123, key: "test-only-secret".repeat(4) };
      creations++;
      return Response.json({ result: [token] });
    }
    if (init.method === "DELETE") {
      token = null;
      return Response.json({ result: [] });
    }
    return Response.json({
      result: [{ ...token, access: unsafe ? { type: 1 } : token.access }],
    });
  }) as typeof fetch;
  return {
    broker: new FlespiBroker("test-master", "g25/test", request),
    creations: () => creations,
  };
}
test("flespi : ACL MQTT seules, jeton distinct et reprise sans duplication", async () => {
  const { broker, creations } = fixture();
  await broker.checkConfiguration();
  const first = await broker.ensureDevice({ id });
  const second = await broker.ensureDevice({ id });
  assert.equal(creations(), 1);
  assert.equal(first.remoteTokenId, second.remoteTokenId);
  assert.equal(first.credentials.password, "");
  const rules = broker.rules(id);
  assert.deepEqual(rules[0], {
    uri: "mqtt",
    topic: `g25/test/${id}/commands`,
    actions: ["subscribe"],
    methods: [],
  });
  assert.equal(rules[1].actions[0], "publish");
  await broker.removeDeviceToken(id, first.remoteTokenId);
});
test("flespi : ACL étendues ou suppression d’un autre objet refusées", async () => {
  await assert.rejects(
    fixture(true).broker.ensureDevice({ id }),
    /ACL_NOT_CONFIRMED/,
  );
  const { broker } = fixture();
  const value = await broker.ensureDevice({ id });
  await assert.rejects(
    broker.removeDeviceToken("other", value.remoteTokenId),
    /DELETE_REFUSED/,
  );
});
test("flespi : échec réseau sans contenu secret et paramètres invalides refusés", async () => {
  const broker = new FlespiBroker("secret", "g25/test", (async () => {
    throw Error("private-secret-in-error");
  }) as typeof fetch);
  await assert.rejects(broker.checkConfiguration(), {
    message: "FLESPI_UNAVAILABLE",
  });
  assert.throws(() => broker.rules("wrong"), /DEVICE_ID_INVALID/);
  assert.throws(
    () => new FlespiBroker("", "g25/test"),
    /CONFIGURATION_INVALID/,
  );
});

test("sonde flespi : préfixe isolé et suppression de passerelle réelle interdite", async () => {
  const old = process.env.MQTT_PREFIX;
  process.env.MQTT_PREFIX = "g25/installation-reelle";
  try {
    const first = flespiProbePrefix(),
      second = flespiProbePrefix();
    assert.notEqual(first, process.env.MQTT_PREFIX);
    assert.notEqual(first, second);
    assert.match(first, /^g25\/probe-[a-f0-9]{32}$/);
    await assert.rejects(
      fixture().broker.removeDeviceToken("gateway", 123),
      /GATEWAY_DELETE_REFUSED/,
    );
  } finally {
    if (old === undefined) delete process.env.MQTT_PREFIX;
    else process.env.MQTT_PREFIX = old;
  }
});
