import { test, expect } from "@playwright/test";
import { JsonRpcProvider } from "ethers";
import { wallet } from "./wallet-helper";
test("nouvel objet : provisionnement, propriété, MQTT réel, visuel et isolation", async ({
  page,
  browser,
}) => {
  test.setTimeout(120000);
  await wallet(page, "fresh");
  await page.goto("/connect");
  await page
    .getByRole("button", { name: "Connecter le portefeuille", exact: true })
    .click();
  await expect(page.getByRole("button", { name: /Déconnexion/ })).toBeVisible();
  const address = await page.evaluate(
    async () => (await window.ethereum.request({ method: "eth_accounts" }))[0],
  );
  const rpc = new JsonRpcProvider("http://127.0.0.1:8545");
  expect((await rpc.getNetwork()).chainId).toBe(31337n);
  await rpc.send("hardhat_setBalance", [address, "0x56bc75e2d63100000"]);
  const created: string[] = [];
  for (const [model, actions, states] of [
    ["G25-LOCK", ["Verrouiller", "Déverrouiller"], ["lock", "unlock"]],
    ["G25-PLUG", ["Allumer", "Éteindre"], ["on", "off"]],
    ["G25-CAM", ["Activer", "Désactiver"], ["activate", "deactivate"]],
  ] as const) {
    if (
      process.env.PROVISION_TEST_MODEL &&
      model !== process.env.PROVISION_TEST_MODEL
    )
      continue;
    await page.evaluate(() => {
      history.pushState({}, "", "/devices/new");
      dispatchEvent(new PopStateEvent("popstate"));
    });
    await page
      .getByLabel("Nom de mon appareil")
      .fill("Test dynamique " + model);
    await page
      .getByLabel("Type d’appareil à préparer", { exact: true })
      .selectOption(model);
    await page
      .getByRole("button", { name: "Préparer cet appareil", exact: true })
      .click();
    const labelInput = page.getByLabel("Identifiant normalisé");
    await expect(labelInput).toHaveValue(/^(LOCK|PLUG|CAM)-[A-F0-9]{12}$/);
    const label = await labelInput.inputValue();
    created.push(label);
    await expect(
      page.getByLabel("Adresse publique provisionnée par le simulateur"),
    ).toHaveValue(/^0x[0-9a-fA-F]{40}$/);
    await expect(
      page.getByRole("button", { name: "Enregistrer sur chaîne" }),
    ).toBeEnabled();
    await page.getByRole("button", { name: "Enregistrer sur chaîne" }).click();
    const card = page.locator("article.device").filter({ hasText: label });
    await expect(card).toBeVisible({ timeout: 20000 });
    await card.getByRole("link", { name: /Voir/ }).click();
    const path = new URL(page.url()).pathname;
    for (let a = 0; a < actions.length; a++) {
      page.once("dialog", (dialog) => dialog.accept());
      await page.getByRole("button", { name: actions[a], exact: true }).click();
      await expect(page).toHaveURL(/\/commands$/);
      await expect(
        page
          .locator("tr")
          .filter({ hasText: label })
          .filter({ hasText: actions[a] })
          .first(),
      ).toContainText("exécutée", { timeout: 25000 });
      await page.evaluate((path) => {
        history.pushState({}, "", path);
        dispatchEvent(new PopStateEvent("popstate"));
      }, path);
      await expect(
        page.getByRole("figure", {
          name: "Appareil simulé " + label,
          exact: true,
        }),
      ).toHaveAttribute("data-state", states[a], { timeout: 15000 });
    }
  }
  const other = await browser.newPage({ baseURL: "http://127.0.0.1:5173" });
  try {
    await wallet(other, "fresh");
    await other.goto("/connect");
    await other
      .getByRole("button", { name: "Connecter le portefeuille", exact: true })
      .click();
    await expect(
      other.getByRole("button", { name: /Déconnexion/ }),
    ).toBeVisible();
    await other.evaluate(() => {
      history.pushState({}, "", "/setup");
      dispatchEvent(new PopStateEvent("popstate"));
    });
    await expect(
      other.getByRole("heading", { name: "Votre compte et ses droits" }),
    ).toBeVisible();
    for (const label of created)
      await expect(other.locator("main")).not.toContainText(label);
  } finally {
    await other.close();
    await rpc.destroy();
  }
});
