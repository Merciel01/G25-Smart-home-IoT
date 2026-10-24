import { test, expect } from "@playwright/test";
import { id } from "ethers";
// UI fixtures isolate rendering. These tests do not claim a real MQTT execution.
test.use({
  launchOptions: {
    args: [
      "--use-fake-device-for-media-stream",
      "--use-fake-ui-for-media-stream",
    ],
  },
  permissions: ["camera"],
});

test("webcam locale : lecture, désactivation, refus et nettoyage", async ({
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
      data = { rpc: true, mqtt: true, indexer: true };
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
  await page.evaluate((camId) => {
    history.pushState({}, "", "/devices/" + camId);
    dispatchEvent(new PopStateEvent("popstate"));
  }, id("CAM-01"));
  await page.evaluate(() => {
    const original = navigator.mediaDevices.getUserMedia.bind(
      navigator.mediaDevices,
    );
    (window as any).__streams = [];
    navigator.mediaDevices.getUserMedia = async (constraints) => {
      const stream = await original(constraints);
      (window as any).__streams.push(stream);
      return stream;
    };
  });
  const preview = page.getByRole("region", { name: "Webcam locale" });
  await preview.getByRole("button", { name: "Ouvrir la webcam" }).click();
  await expect(
    preview.getByText("Webcam en direct · aperçu local", { exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => (window as any).__streams[0].getAudioTracks().length,
    ),
  ).toBe(0);
  phase = 1;
  await expect(
    preview.getByText("Webcam arrêtée", { exact: true }),
  ).toBeVisible({ timeout: 10000 });
  expect(
    await page.evaluate(() =>
      (window as any).__streams[0]
        .getTracks()
        .every((t: any) => t.readyState === "ended"),
    ),
  ).toBe(true);
  await expect(
    preview.getByRole("button", { name: "Ouvrir la webcam" }),
  ).toBeDisabled();
  phase = 0;
  await expect(
    preview.getByRole("button", { name: "Ouvrir la webcam" }),
  ).toBeEnabled({ timeout: 10000 });
  await page.evaluate(() => {
    (window as any).__originalMedia = navigator.mediaDevices.getUserMedia;
    navigator.mediaDevices.getUserMedia = async () => {
      throw new DOMException("Refused", "NotAllowedError");
    };
  });
  await preview.getByRole("button", { name: "Ouvrir la webcam" }).click();
  await expect(preview.getByRole("alert")).toContainText(
    "Accès à la webcam refusé",
  );
  await page.evaluate(() => {
    navigator.mediaDevices.getUserMedia = (window as any).__originalMedia;
  });
  await preview.getByRole("button", { name: "Ouvrir la webcam" }).click();
  await expect(
    preview.getByText("Webcam en direct · aperçu local", { exact: true }),
  ).toBeVisible();
  await page.evaluate(() => {
    history.pushState({}, "", "/");
    dispatchEvent(new PopStateEvent("popstate"));
  });
  await expect(preview).toHaveCount(0);
  expect(
    await page.evaluate(() =>
      (window as any).__streams.every((s: any) =>
        s.getTracks().every((t: any) => t.readyState === "ended"),
      ),
    ),
  ).toBe(true);
});
