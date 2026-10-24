import { test, expect } from "@playwright/test";
import fs from "node:fs/promises";
import { Wallet, JsonRpcProvider, Contract, id } from "ethers";
async function wallet(
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
test("guide public et absence de portefeuille", async ({ page }) => {
  const forbidden = await page.request.get(
    "/@fs/" + process.cwd() + "/.local/runtime.json",
  );
  expect([403, 404]).toContain(forbidden.status());
  await page.goto("/");
  await page
    .getByRole("button", { name: "Connecter le portefeuille", exact: true })
    .click();
  await expect(page.getByRole("alert")).toContainText("WALLET_REQUIRED");
  await page.goto("/demo");
  await expect(
    page.getByRole("heading", {
      name: "Maison intelligente — Groupe 25, UNIKIN",
    }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBeTruthy();
});
test("mauvais réseau", async ({ page }) => {
  await wallet(page, "owner", { wrongNetwork: true });
  await page.goto("/connect");
  await page
    .getByRole("button", { name: "Connecter le portefeuille", exact: true })
    .click();
  await expect(page.getByRole("alert")).toContainText("WRONG_NETWORK");
});
test("session réelle signée, tableau de bord, navigation des 18 routes et déconnexion", async ({
  page,
}, info) => {
  await wallet(page);
  await page.goto("/");
  await page
    .getByRole("button", { name: "Connecter le portefeuille", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Bonjour, propriétaire" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Serrure · Entrée" }),
  ).toBeVisible();
  await page.screenshot({
    path: `docs/captures/tableau-de-bord-${info.project.name}.png`,
    fullPage: true,
  });
  const { id } = await import("ethers");
  const did = id("LOCK-01");
  const paths = [
    "/connect",
    "/",
    "/devices",
    "/devices/new",
    "/devices/" + did,
    "/permissions",
    "/permissions/new",
    "/commands",
    "/commands/0x" + "11".repeat(32),
    "/firmware",
    "/manufacturer/firmware/new",
    "/devices/" + did + "/firmware",
    "/security",
    "/audit",
    "/infrastructure",
    "/guest",
    "/manufacturer",
    "/demo",
  ];
  for (const path of paths) {
    await page.evaluate((path) => {
      history.pushState({}, "", path);
      dispatchEvent(new PopStateEvent("popstate"));
    }, path);
    await expect(page.locator("h1")).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      path,
    ).toBeTruthy();
  }
  await page.evaluate(() => {
    history.pushState({}, "", "/");
    dispatchEvent(new PopStateEvent("popstate"));
  });
  await page.getByRole("button", { name: /Déconnexion/ }).click();
  await expect(
    page.getByRole("button", {
      name: "Connecter le portefeuille",
      exact: true,
    }),
  ).toBeVisible();
});
test("changement de compte invalide la session", async ({ page }) => {
  await wallet(page);
  await page.goto("/");
  await page
    .getByRole("button", { name: "Connecter le portefeuille", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Bonjour, propriétaire" }),
  ).toBeVisible();
  await page.evaluate(() =>
    (window as any).ethereum._change("accountsChanged"),
  );
  await expect(
    page.getByRole("button", {
      name: "Connecter le portefeuille",
      exact: true,
    }),
  ).toBeVisible();
});
test("indisponibilité API reste une erreur visible", async ({ page }) => {
  await page.route("**/public-config", (route) => route.abort());
  await page.goto("/");
  await expect(page.getByRole("alert")).toContainText("GATEWAY_UNAVAILABLE");
});

test("signature de session annulée", async ({ page }) => {
  await wallet(page, "owner", { reject: true });
  await page.goto("/connect");
  await page
    .getByRole("button", { name: "Connecter le portefeuille", exact: true })
    .click();
  await expect(page.getByRole("alert")).toContainText("SIGNATURE_REJECTED");
});
test("commande via interface jusqu’à accusé authentifié", async ({ page }) => {
  await wallet(page);
  await page.goto("/");
  await page
    .getByRole("button", { name: "Connecter le portefeuille", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Bonjour, propriétaire" }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Voir la serrure" }).click();
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Verrouiller", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Commandes", exact: true }),
  ).toBeVisible();
  await expect(
    page.locator("tr").filter({ hasText: "Verrouiller" }).first(),
  ).toContainText("exécutée", { timeout: 25000 });
});

async function navigateClient(page: any, path: string) {
  await page.evaluate((path: string) => {
    history.pushState({}, "", path);
    dispatchEvent(new PopStateEvent("popstate"));
  }, path);
}
async function connectRole(page: any, role = "owner") {
  await wallet(page, role);
  await page.goto("/");
  await page
    .getByRole("button", { name: "Connecter le portefeuille", exact: true })
    .click();
  await expect(
    page.getByRole("heading", {
      name:
        role === "manufacturer"
          ? "Bonjour, fabricant"
          : "Bonjour, propriétaire",
    }),
  ).toBeVisible();
}
test("formulaire de permission : validations, octroi et révocation", async ({
  page,
}) => {
  await connectRole(page);
  await navigateClient(page, "/permissions/new");
  await page.getByLabel("Adresse bénéficiaire").fill("invalide");
  await page.getByLabel(/Expiration —/).fill(
    await page.evaluate(() => {
      const d = new Date(Date.now() + 600000);
      return new Date(d.getTime() - d.getTimezoneOffset() * 60000)
        .toISOString()
        .slice(0, 16);
    }),
  );
  await page.getByRole("checkbox", { name: "Déverrouiller" }).check();
  await page
    .getByRole("button", { name: "Accorder l’accès temporaire" })
    .click();
  await expect(page.getByRole("alert")).toContainText("Bénéficiaire invalide");
  const keys = JSON.parse(await fs.readFile(".local/identities.json", "utf8"));
  const guest = new Wallet(keys.guest).address;
  await page.getByLabel("Adresse bénéficiaire").fill(guest);
  await page.getByRole("checkbox", { name: "Déverrouiller" }).uncheck();
  await page
    .getByRole("button", { name: "Accorder l’accès temporaire" })
    .click();
  await expect(page.getByRole("alert")).toContainText("Choisissez une action");
  await page.getByRole("checkbox", { name: "Déverrouiller" }).check();
  await page
    .getByRole("button", { name: "Accorder l’accès temporaire" })
    .click();
  await expect(
    page.getByRole("heading", { name: "Permissions", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Révoquer l’accès" }),
  ).toBeVisible({ timeout: 10000 });
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "Révoquer l’accès" }).click();
  await expect(
    page.getByRole("button", { name: "Révoquer l’accès" }),
  ).toHaveCount(0, { timeout: 10000 });
});
test("fabricant : fichier, signature et publication réelle", async ({
  page,
}) => {
  const env = JSON.parse(await fs.readFile(".local/runtime.json", "utf8"));
  const dep = JSON.parse(await fs.readFile("deployments/local.json", "utf8"));
  const fw = new Contract(
    dep.firmwareRegistry,
    dep.firmwareAbi,
    new JsonRpcProvider(env.RPC_URL),
  );
  const version = Number(await fw.latestVersion(id("G25-LOCK"))) + 100;
  await connectRole(page, "manufacturer");
  await navigateClient(page, "/manufacturer/firmware/new");
  await page.getByLabel(/Version monotone/).fill(String(version));
  await page
    .getByLabel(/Micrologiciel de démonstration/)
    .setInputFiles("firmware/G25-LOCK-1.1.0.bin");
  await page.getByRole("button", { name: "Signer et publier" }).click();
  await expect(
    page.getByRole("heading", { name: "Micrologiciels", exact: true }),
  ).toBeVisible({ timeout: 15000 });
  await page
    .getByRole("button", { name: "Charger les publications sur chaîne" })
    .first()
    .click();
  await expect(
    page.getByRole("heading", { name: "Version " + version, exact: true }),
  ).toBeVisible();
});
test("propriétaire : installation depuis le catalogue, résultat signé", async ({
  page,
}) => {
  const env = JSON.parse(await fs.readFile(".local/runtime.json", "utf8"));
  const dep = JSON.parse(await fs.readFile("deployments/local.json", "utf8"));
  const fw = new Contract(
    dep.firmwareRegistry,
    dep.firmwareAbi,
    new JsonRpcProvider(env.RPC_URL),
  );
  const version = Number(await fw.latestVersion(id("G25-LOCK")));
  await connectRole(page);
  await navigateClient(page, "/devices/" + id("LOCK-01") + "/firmware");
  await page
    .getByRole("button", { name: "Charger les publications sur chaîne" })
    .click();
  const release = page.locator("article.release").filter({
    has: page.getByRole("heading", {
      name: "Version " + version,
      exact: true,
    }),
  });
  page.once("dialog", (d) => d.accept());
  await release
    .getByRole("button", { name: "Autoriser l’installation simulée" })
    .click();
  await expect(page.locator("main")).toContainText(
    "Version " + version + " : installée",
    { timeout: 25000 },
  );
});

test("enregistrement : modèle cohérent et doublon expliqué avant transaction", async ({
  page,
}) => {
  await wallet(page, "guest");
  await page.goto("/");
  await page
    .getByRole("button", { name: "Connecter le portefeuille", exact: true })
    .click();
  await expect(page.getByRole("button", { name: /Déconnexion/ })).toBeVisible();
  await navigateClient(page, "/devices/new");
  await page.evaluate(() => {
    const original = window.ethereum.request;
    (window as any).__registrationTransactions = 0;
    window.ethereum.request = (args: any) => {
      if (args.method === "eth_sendTransaction")
        (window as any).__registrationTransactions++;
      return original(args);
    };
  });
  await page.getByLabel("Identifiant normalisé").fill("PLUG-01");
  await expect(page.getByLabel("Modèle", { exact: true })).toHaveValue(
    "G25-PLUG",
  );
  const runtime = JSON.parse(await fs.readFile(".local/runtime.json", "utf8"));
  const deviceKeys = JSON.parse(runtime.DEVICE_KEYS_JSON);
  const address = new Wallet(deviceKeys[id("PLUG-01")]).address;
  await page
    .getByLabel("Adresse publique provisionnée par le simulateur")
    .fill(address);
  await page.getByLabel("Modèle", { exact: true }).selectOption("G25-LOCK");
  await page.getByRole("button", { name: "Enregistrer sur chaîne" }).click();
  await expect(page.getByRole("alert")).toContainText("WRONG_MODEL");
  await page.getByLabel("Modèle", { exact: true }).selectOption("G25-PLUG");
  await page.getByRole("button", { name: "Enregistrer sur chaîne" }).click();
  await expect(page.getByRole("alert")).toContainText(
    "DEVICE_ALREADY_REGISTERED",
  );
  await expect(page.getByRole("alert")).toContainText(
    "demandez une permission",
  );
  expect(
    await page.evaluate(() => (window as any).__registrationTransactions),
  ).toBe(0);
});

test("configuration multi-comptes : propriétaire identifiable et invité sans privilège", async ({
  page,
}) => {
  await wallet(page, "guest");
  await page.goto("/connect");
  await page
    .getByRole("button", { name: "Connecter le portefeuille", exact: true })
    .click();
  await expect(page.getByRole("button", { name: /Déconnexion/ })).toBeVisible();
  const menu = page.getByRole("button", { name: "☰ Menu" });
  if (await menu.isVisible()) await menu.click();
  await page
    .getByRole("link", { name: "Comptes et configuration", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Votre compte et ses droits" }),
  ).toBeVisible();
  await expect(
    page.getByText("Vous possédez 0 objet(s).", { exact: false }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "LOCK-01 — G25-LOCK" }),
  ).toBeVisible();
  await expect(
    page.getByText("Déjà enregistré par un autre compte"),
  ).toHaveCount(3);
  await expect(
    page.getByRole("button", {
      name: "Confirmer la modification du fabricant",
    }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("link", { name: "Accorder une permission à un compte" }),
  ).toHaveCount(0);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBeTruthy();
});

test("configuration du propriétaire : lien de gestion des accès", async ({
  page,
}) => {
  await wallet(page);
  await page.goto("/connect");
  await page
    .getByRole("button", { name: "Connecter le portefeuille", exact: true })
    .click();
  await expect(page.getByRole("button", { name: /Déconnexion/ })).toBeVisible();
  const menu = page.getByRole("button", { name: "☰ Menu" });
  if (await menu.isVisible()) await menu.click();
  await page
    .getByRole("link", { name: "Comptes et configuration", exact: true })
    .click();
  await expect(
    page.getByText("Vous possédez 3 objet(s).", { exact: false }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Accorder une permission à un compte" }),
  ).toBeVisible();
  await page
    .getByRole("link", { name: "Accorder une permission à un compte" })
    .click();
  await expect(
    page.getByRole("button", { name: "Accorder l’accès temporaire" }),
  ).toBeVisible();
});

test("administrateur : autorisation puis révocation réelle d’un fabricant", async ({
  page,
}) => {
  await wallet(page, "admin");
  await page.goto("/connect");
  await page
    .getByRole("button", { name: "Connecter le portefeuille", exact: true })
    .click();
  await expect(page.getByRole("button", { name: /Déconnexion/ })).toBeVisible();
  const menu = page.getByRole("button", { name: "☰ Menu" });
  if (await menu.isVisible()) await menu.click();
  await page
    .getByRole("link", { name: "Comptes et configuration", exact: true })
    .click();
  const manufacturer = Wallet.createRandom().address;
  const runtime = JSON.parse(await fs.readFile(".local/runtime.json", "utf8"));
  const artifact = JSON.parse(
    await fs.readFile("artifacts/FirmwareRegistry.json", "utf8"),
  );
  const firmware = new Contract(
    runtime.FIRMWARE_REGISTRY_ADDRESS,
    artifact.abi,
    new JsonRpcProvider(runtime.RPC_URL),
  );
  await page.getByLabel("Adresse publique du fabricant").fill(manufacturer);
  await page
    .getByRole("button", { name: "Confirmer la modification du fabricant" })
    .click();
  await expect
    .poll(() => firmware.isManufacturerAuthorized(id("G25-LOCK"), manufacturer))
    .toBe(true);
  await expect(
    page.getByRole("button", {
      name: "Confirmer la modification du fabricant",
    }),
  ).toBeEnabled();
  await page
    .getByLabel("Opération", { exact: true })
    .selectOption("revokeManufacturer");
  await page
    .getByRole("button", { name: "Confirmer la modification du fabricant" })
    .click();
  await expect
    .poll(() => firmware.isManufacturerAuthorized(id("G25-LOCK"), manufacturer))
    .toBe(false);
});

test("demande d’accès : invité, approbation signée du propriétaire et révocation", async ({
  page,
  browser,
}) => {
  async function connectSetup(p: any) {
    await p.goto("/connect");
    await p
      .getByRole("button", { name: "Connecter le portefeuille", exact: true })
      .click();
    await expect(p.getByRole("button", { name: /Déconnexion/ })).toBeVisible();
    const menu = p.getByRole("button", { name: "☰ Menu" });
    if (await menu.isVisible()) await menu.click();
    await p
      .getByRole("link", { name: "Comptes et configuration", exact: true })
      .click();
  }
  await wallet(page, "fresh");
  await connectSetup(page);
  const recipient = await page.evaluate(
    async () =>
      (await (window as any).ethereum.request({ method: "eth_accounts" }))[0],
  );
  await page
    .getByRole("button", {
      name: "Demander les actions de LOCK-01 pour une heure",
      exact: true,
    })
    .click();
  await expect(
    page.getByRole("heading", { name: "LOCK-01 — en attente", exact: true }),
  ).toBeVisible();
  const owner = await browser.newPage({ baseURL: "http://127.0.0.1:5173" });
  try {
    await wallet(owner);
    await connectSetup(owner);
    const request = owner.locator("article").filter({ hasText: recipient });
    await expect(request).toHaveCount(1);
    await request.getByRole("button", { name: "Approuver la demande" }).click();
    await expect(
      page.getByRole("heading", { name: "LOCK-01 — accordée", exact: true }),
    ).toBeVisible({ timeout: 15000 });
    const runtime = JSON.parse(
      await fs.readFile(".local/runtime.json", "utf8"),
    );
    const keys = JSON.parse(
      await fs.readFile(".local/identities.json", "utf8"),
    );
    const artifact = JSON.parse(
      await fs.readFile("artifacts/SmartHomeRegistry.json", "utf8"),
    );
    const home = new Contract(
      runtime.REGISTRY_ADDRESS,
      artifact.abi,
      new Wallet(keys.owner, new JsonRpcProvider(runtime.RPC_URL)),
    );
    await (await home.revokePermission(id("LOCK-01"), recipient)).wait();
    await page
      .getByRole("button", {
        name: "Demander les actions de PLUG-01 pour une heure",
        exact: true,
      })
      .click();
    const plugRequest = owner
      .locator("article")
      .filter({ hasText: recipient })
      .filter({
        has: owner.getByRole("heading", {
          name: "PLUG-01 — en attente",
          exact: true,
        }),
      });
    await plugRequest
      .getByRole("button", { name: "Refuser la demande" })
      .click();
    await expect(
      page.getByRole("heading", { name: "PLUG-01 — refusée", exact: true }),
    ).toBeVisible({ timeout: 15000 });
    expect(await home.hasPermission(id("PLUG-01"), recipient, 2)).toBe(false);
    await expect(
      page.getByRole("heading", { name: "LOCK-01 — en attente", exact: true }),
    ).toBeVisible({ timeout: 15000 });
  } finally {
    await owner.close();
  }
});
