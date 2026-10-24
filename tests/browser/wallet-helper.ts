import { test, expect } from "@playwright/test";
import fs from "node:fs/promises";
import { Wallet, JsonRpcProvider, Contract, id } from "ethers";
export async function wallet(
  page: any,
  kind = "owner",
  options: { wrongNetwork?: boolean; reject?: boolean } = {},
) {
  const env = JSON.parse(await fs.readFile(".local/runtime.json", "utf8"));
  const identities = JSON.parse(
    await fs.readFile(".local/identities.json", "utf8"),
  );
  const signer = new Wallet(
    kind === "fresh" ? Wallet.createRandom().privateKey : identities[kind],
    new JsonRpcProvider(env.RPC_URL, undefined, { cacheTimeout: -1 }),
  );
  await page.exposeFunction(
    "walletRequest",
    async ({ method, params }: any) => {
      if (method === "eth_requestAccounts" || method === "eth_accounts")
        return [signer.address];
      if (method === "eth_chainId")
        return options.wrongNetwork ? "0x1" : "0x7a69";
      if (method === "eth_sendTransaction") {
        const t = { ...params[0] };
        delete t.from;
        if (t.gas) {
          t.gasLimit = t.gas;
          delete t.gas;
        }
        return (await signer.sendTransaction(t)).hash;
      }
      if (method === "eth_signTypedData_v4") {
        const data = JSON.parse(params[1]);
        const types = { ...data.types };
        delete types.EIP712Domain;
        return signer.signTypedData(data.domain, types, data.message);
      }
      if (method === "personal_sign") {
        if (options.reject)
          throw Object.assign(Error("User rejected request"), { code: 4001 });
        const message = params[0];
        return signer.signMessage(
          message.startsWith("0x")
            ? Buffer.from(message.slice(2), "hex")
            : message,
        );
      }
      try {
        return await (signer.provider as JsonRpcProvider).send(
          method,
          params ?? [],
        );
      } catch (e: any) {
        console.error(
          "RPC test",
          method,
          e.code,
          e.info?.error?.message ?? e.shortMessage,
        );
        throw e;
      }
    },
  );
  await page.addInitScript(() => {
    const callbacks: any = {};
    (window as any).ethereum = {
      request: async (args: any) => {
        try {
          return await (window as any).walletRequest(args);
        } catch (e: any) {
          if (e.message.includes("User rejected request"))
            throw { code: 4001, message: "User rejected request" };
          throw e;
        }
      },
      on: (name: string, fn: any) => {
        callbacks[name] = fn;
      },
      removeListener: (name: string) => {
        delete callbacks[name];
      },
      _change: (name: string) => callbacks[name]?.([]),
    };
  });
}
