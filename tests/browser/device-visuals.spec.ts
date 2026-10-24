import { test, expect } from "@playwright/test";
import { id } from "ethers";
// UI fixtures isolate rendering. These tests do not claim a real MQTT execution.
test("visuels : états confirmés, actualisation, hors ligne et révocation", async ({
  page,
}) => {
  const account = "0x1111111111111111111111111111111111111111";
  let phase = 0;
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
      data = { rpc: true, mqtt: phase !== 2, indexer: true };
    if (path === "/commands" || path === "/audit") data = { items: [] };
    if (path === "/onboarding") data = { objects: [], administrator: account };
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
  const lock = page.getByRole("figure", {
    name: "Appareil simulé LOCK-01",
    exact: true,
  });
  const plug = page.getByRole("figure", {
    name: "Appareil simulé PLUG-01",
    exact: true,
  });
  const camera = page.getByRole("figure", {
    name: "Appareil simulé CAM-01",
    exact: true,
  });
  await expect(lock).toHaveAttribute("data-state", "lock");
  await expect(plug).toHaveAttribute("data-state", "on");
  await expect(camera).toHaveAttribute("data-state", "activate");
  await expect(plug.locator(".lamp-glow")).toHaveCount(1);
  await page.screenshot({
    path: `docs/visuels-${test.info().project.name}.png`,
    fullPage: true,
  });
  phase = 1;
  await expect(lock).toHaveAttribute("data-state", "unlock", {
    timeout: 10000,
  });
  await expect(plug).toHaveAttribute("data-state", "off");
  await expect(camera).toHaveAttribute("data-state", "deactivate");
  await expect(plug.locator(".lamp-glow")).toHaveCount(0);
  phase = 2;
  await expect(
    page.getByText("Connexion MQTT interrompue.", { exact: true }),
  ).toBeVisible({ timeout: 10000 });
  await expect(lock).toHaveAttribute("data-state", "offline", {
    timeout: 10000,
  });
  await expect(plug.locator(".lamp-glow")).toHaveCount(0);
  await expect(camera).toHaveAttribute("data-state", "offline");
  phase = 3;
  await expect(lock).toHaveAttribute("data-state", "revoked", {
    timeout: 10000,
  });
  await expect(
    page.getByText("Connexion MQTT interrompue.", { exact: true }),
  ).toHaveCount(0);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBeTruthy();
});
