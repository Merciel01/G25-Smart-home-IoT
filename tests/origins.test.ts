import { test } from "node:test";
import assert from "node:assert/strict";
import { parseOrigins } from "../packages/shared/src/origins.ts";
test("origines : espaces et slash final normalisés, domaine exact conservé", () => {
  assert.deepEqual(
    parseOrigins(" https://g25-smart-home-io-t.vercel.app/\n", true),
    ["https://g25-smart-home-io-t.vercel.app"],
  );
  for (const bad of [
    "http://example.com",
    "https://example.com/path",
    "https://user:pass@example.com",
    "https://example.com?x=1",
    "*",
  ])
    assert.throws(() => parseOrigins(bad, true));
});
