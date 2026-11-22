import { expect, test } from "@playwright/test";
import fs from "node:fs";
import { signUp, uniquePhone, BASE } from "./helpers";

/** Seta de voltar: pai fixo por rota, sem passar por /entrar. Prints só se SETA_DIR estiver definido. */
const SHOTS = process.env.SETA_DIR;

test("seta de voltar no app do passageiro", async ({ browser }) => {
  test.setTimeout(120_000);
  const ctx = await browser.newContext({ baseURL: BASE, viewport: { width: 440, height: 956 }, isMobile: true, hasTouch: true, reducedMotion: "reduce" });
  await ctx.addInitScript(() => { try { localStorage.setItem("prumo-cookies-ok", "1"); } catch { /* sem armazenamento */ } });
  const page = await ctx.newPage();
  await signUp(page, "passageiro", uniquePhone(), "Bruna Teste Voltar");

  // Em /passageiro não existe seta (o Início tem o voltar do pedido).
  await expect(page.getByTestId("app-back")).toHaveCount(0);

  // Abre a aba direto (sem histórico) e volta para o Início sem passar por /entrar.
  await page.goto("/passageiro/viagens");
  const seta = page.getByRole("button", { name: "Voltar para Início" });
  await expect(seta).toBeVisible();
  const box = await seta.boundingBox();
  expect(box!.width).toBeGreaterThanOrEqual(44);
  expect(box!.height).toBeGreaterThanOrEqual(44);
  if (SHOTS) { fs.mkdirSync(SHOTS, { recursive: true }); await page.screenshot({ path: `${SHOTS}/passageiro-viagens-440.png` }); }
  const visited: string[] = [];
  page.on("framenavigated", (f) => { if (f === page.mainFrame()) visited.push(new URL(f.url()).pathname); });
  await seta.click();
  await page.waitForURL("**/passageiro");
  expect(visited.some((p) => p.startsWith("/entrar"))).toBe(false);
  await expect(page.getByTestId("app-back")).toHaveCount(0);

  // Subtela: dirigir volta para a Conta.
  await page.goto("/passageiro/dirigir");
  await page.getByRole("button", { name: "Voltar para Conta" }).click();
  await page.waitForURL("**/passageiro/conta");

  if (SHOTS) {
    await page.screenshot({ path: `${SHOTS}/passageiro-conta-440.png` });
    await page.goto("/passageiro/ajuda");
    await page.screenshot({ path: `${SHOTS}/passageiro-ajuda-440.png` });
    await page.setViewportSize({ width: 360, height: 780 });
    await page.screenshot({ path: `${SHOTS}/passageiro-ajuda-360.png` });
    await page.goto("/passageiro/viagens");
    await page.screenshot({ path: `${SHOTS}/passageiro-viagens-360.png` });
    await page.goto("/passageiro/dirigir");
    await page.screenshot({ path: `${SHOTS}/passageiro-dirigir-360.png` });
  }
  await ctx.close();
});

test("seta de voltar no app do motorista (modo duplo a 360 px)", async ({ browser }) => {
  test.setTimeout(180_000);
  const ctx = await browser.newContext({ baseURL: BASE, viewport: { width: 360, height: 780 }, isMobile: true, hasTouch: true, reducedMotion: "reduce" });
  await ctx.addInitScript(() => { try { localStorage.setItem("prumo-cookies-ok", "1"); } catch { /* sem armazenamento */ } });
  const page = await ctx.newPage();
  await signUp(page, "motorista", uniquePhone(), "Caio Teste Voltar");
  await expect(page.getByTestId("app-back")).toHaveCount(0);
  await page.goto("/motorista/clube/termos");
  const seta = page.getByRole("button", { name: "Voltar para Clube" });
  await expect(seta).toBeVisible();
  if (SHOTS) { fs.mkdirSync(SHOTS, { recursive: true }); await page.screenshot({ path: `${SHOTS}/motorista-termos-360.png` }); }
  await seta.click();
  await page.waitForURL("**/motorista/clube");
  await page.goto("/motorista/ganhos");
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/motorista-ganhos-360.png` });
  await page.getByRole("button", { name: "Voltar para Dirigir" }).click();
  await page.waitForURL(/\/motorista$/);
  // Motorista no app do passageiro: seta e botão de modo cabem juntos, sem estourar a largura.
  await page.goto("/passageiro/conta");
  await expect(page.getByTestId("mode-switch")).toBeVisible();
  await expect(page.getByRole("button", { name: "Voltar para Início" })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/motorista-no-app-passageiro-360.png` });
  await ctx.close();
});
