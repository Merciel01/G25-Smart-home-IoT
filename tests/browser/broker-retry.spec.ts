import { test, expect } from "@playwright/test";
import { id } from "ethers";
// UI fixtures isolate rendering. These tests do not claim a real MQTT execution.
test("reprise broker : identité conservée et champs remplis après confirmation", async ({
  page,
}) => {
  const account = "0x1111111111111111111111111111111111111111";
  let phase = 0;
  let retries = 0;
  const prepared = {
    id: id("LOCK-PENDING"),
    label: "LOCK-PENDING",
    model: "G25-LOCK",
    signer: "0x" + "22".repeat(20),
    name: "Serrure en attente",
  };
  await page.addInitScript(
    ({ account }) => {
      (window as any).ethereum = {
        on() {},
        removeListener() {},
        request: async ({ method }: any) => {
          if (method === "eth_chainId") return "0x7a69";
          if (method === "eth_accounts" || method === "eth_requestAccounts")
            return [account];
          if (method === "personal_sign") return "0x" + "11".repeat(65);
          throw Error(method);
        },
      };
    },
    { account },
  );
  await page.route("http://127.0.0.1:3001/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    let data: any = [];
    if (path === "/public-config")
      data = {
        chainId: 31337,
        mode: "local",
        registry: account,
        firmwareRegistry: account,
        abi: [],
        firmwareAbi: [],
      };
    if (path === "/auth/challenge") data = { message: "UI fixture" };
    if (path === "/auth/verify")
      data = { token: "ui-fixture", address: account };
    if (path === "/infrastructure")
      data = { rpc: true, mqtt: true, indexer: true };
    if (path === "/commands" || path === "/audit") data = { items: [] };
    if (path === "/onboarding")
      data = {
        objects: [
          {
            ...prepared,
            signer: retries < 2 ? null : prepared.signer,
            provisioningStatus: retries < 2 ? "pending" : "ready",
            registered: false,
          },
        ],
        automaticProvisioning: true,
        administrator: account,
      };
    if (path.endsWith("/retry")) {
      retries++;
      if (retries === 1) {
        await route.fulfill({
          status: 503,
          json: { message: "Broker indisponible, identité conservée" },
        });
        return;
      }
      data = prepared;
    }
    if (path === "/devices")
      data = {
        manufacturerModels: [],
        devices: ["LOCK", "PLUG", "CAM"].map((kind, i) => ({
          id: id(kind + "-01"),
          label: kind + "-01",
          name: kind,
          modelId: id("G25-" + kind),
          owner: account,
          signer: account,
          isOwner: true,
          revoked: phase === 3,
          online: phase !== 2,
          lastSeen: Date.now() - (phase === 2 ? 60000 : 0),
          state: (phase === 1
            ? ["UNLOCK", "OFF", "DEACTIVATE"]
            : ["LOCK", "ON", "ACTIVATE"])[i],
          actions: [i * 2, i * 2 + 1],
          allowed: [true, true, true, true, true, true],
        })),
      };
    await route.fulfill({ json: data });
  });
  await page.goto("/connect");
  await page
    .getByRole("button", { name: "Connecter le portefeuille", exact: true })
    .click();
  await expect(page.getByRole("button", { name: /Déconnexion/ })).toBeVisible();
  // Navigate within the app to preserve its in-memory session.
  await page.evaluate(() => {
    history.pushState({}, "", "/");
    dispatchEvent(new PopStateEvent("popstate"));
  });
  await page.evaluate(() => {
    history.pushState({}, "", "/devices/new");
    dispatchEvent(new PopStateEvent("popstate"));
  });
  const retry = page.getByRole("button", {
    name: "Réessayer la préparation de LOCK-PENDING",
    exact: true,
  });
  await retry.click();
  await expect(page.getByRole("alert")).toContainText("identité conservée");
  await retry.click();
  await expect(page.getByLabel("Identifiant normalisé")).toHaveValue(
    "LOCK-PENDING",
  );
  await expect(
    page.getByLabel("Adresse publique provisionnée par le simulateur"),
  ).toHaveValue(prepared.signer);
  await expect(retry).toHaveCount(0);
});
