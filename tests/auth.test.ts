import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { Wallet } from "ethers";
import { Store } from "../packages/shared/src/storage.ts";
import { authService } from "../apps/gateway/src/auth.ts";
import { SiweMessage } from "siwe";
test("SIWE : nonce unique, expiration, domaine, faux signataire et session", async () => {
  const directory = await fs.mkdtemp("/tmp/g25-auth-");
  const store = new Store("auth", undefined, directory);
  await store.init();
  const origin = "https://demo.example";
  const auth = authService(store, [origin], 31337);
  const wallet = Wallet.createRandom();
  const request: any = {
    body: { address: wallet.address },
    get: (name: string) => (name === "origin" ? origin : undefined),
  };
  let result: any;
  const response: any = {
    json: (v: any) => {
      result = v;
    },
    locals: {},
    status: () => response,
  };
  await auth.challenge(request, response);
  const message = result.message;
  const signature = await wallet.signMessage(message);
  request.body = { message, signature };
  await auth.verify(request, response);
  assert.equal(result.address, wallet.address);
  const token = result.token;
  await assert.rejects(() => auth.verify(request, response), /INVALID_NONCE/);
  let passed = false;
  await auth.middleware(
    { get: () => "Bearer " + token } as any,
    response,
    () => {
      passed = true;
    },
  );
  assert.equal(passed, true);
  await auth.middleware({ get: () => "Bearer fake" } as any, response, () => {
    throw Error("Bypass");
  });
  assert.equal(result.code, "WALLET_REQUIRED");
  request.body = { address: wallet.address };
  await auth.challenge(request, response);
  const original = result.message;
  request.body = {
    message: original,
    signature: await Wallet.createRandom().signMessage(original),
  };
  await assert.rejects(() => auth.verify(request, response));
  request.body = {
    message: original.replace("demo.example", "evil.example"),
    signature,
  };
  await assert.rejects(() => auth.verify(request, response));
  const nonce = new SiweMessage(original).nonce;
  await store.mutate((s) => {
    s.challenges[nonce].expires = 0;
  });
  request.body = {
    message: original,
    signature: await wallet.signMessage(original),
  };
  await assert.rejects(() => auth.verify(request, response), /INVALID_NONCE/);
  await fs.rm(directory, { recursive: true });
});
