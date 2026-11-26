import { expect, request, test, type Page } from "@playwright/test";
import { adminApi, BASE, signUp, uniquePhone } from "./helpers";
import { validCpf } from "./documents";

/**
 * Orbi Food (demonstração), no celular de 360 px. O servidor principal liga PRUMO_FOOD_DEMO (scripts/e2e-server.ts);
 * o servidor da porta 3103 (modo com três endereços) NÃO liga, e é nele que se confere o 404 sem o interruptor.
 */
const PHONE = { viewport: { width: 360, height: 780 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true };
const overflow = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

test("Orbi Food no celular: aba, loja, opcional, checkout, acompanhamento, painel da loja e admin com a calculadora", async ({ browser }) => {
  test.setTimeout(240_000);
  const ctx = await browser.newContext({ ...PHONE, baseURL: BASE, reducedMotion: "reduce" });
  await ctx.addInitScript(() => { try { localStorage.setItem("prumo-cookies-ok", "1"); } catch { /* sem armazenamento */ } });
  const page = await ctx.newPage();
  await signUp(page, "passageiro", uniquePhone(), "Bruna Food");

  // Aba Food na barra de baixo
  const bar = page.getByRole("navigation", { name: "Passageiro" }).last();
  await bar.getByRole("link", { name: "Food" }).click();
  await page.waitForURL("**/passageiro/food");
  await expect(page.getByTestId("food-demo-banner")).toContainText("DEMONSTRAÇÃO · dados fictícios");
  // A loja aparece nos destaques e na lista: o primeiro link basta.
  await expect(page.getByRole("link", { name: /Forno da Serra Pizzaria/ }).first()).toBeVisible();
  await expect(page.getByTestId("food-city")).toContainText("Ipatinga");
  await expect(page.getByTestId("food-banners")).toBeVisible();
  expect(await overflow(page)).toBeLessThanOrEqual(0);

  // Topo: cupons, e o filtro de entrega/retirada
  await page.getByRole("link", { name: "Cupons" }).click();
  await expect(page.getByRole("heading", { name: "Cupons" })).toBeVisible();
  await expect(page.getByText("Frete grátis na 1ª compra")).toBeVisible();
  expect(await overflow(page)).toBeLessThanOrEqual(0);
  await page.getByRole("link", { name: "Voltar ao Food" }).click();
  await page.getByTestId("food-filters").click();
  await page.getByTestId("filter-sheet").getByRole("radio", { name: "Retirada" }).click();
  await page.getByTestId("filter-sheet").getByRole("button", { name: "Limpar" }).click();
  await page.getByTestId("filter-sheet").getByRole("button", { name: /^Ver [0-9]+ lojas/ }).click();
  // Trocar a cidade pelo endereço do topo e voltar
  await page.getByTestId("food-city").click();
  await page.getByTestId("city-sheet").getByRole("radio", { name: /Timóteo/ }).click();
  await expect(page.getByRole("link", { name: /Padaria Trigo Dourado/ }).first()).toBeVisible();
  await expect(page.getByRole("link", { name: /Forno da Serra/ })).toHaveCount(0);
  await page.getByTestId("food-city").click();
  await page.getByTestId("city-sheet").getByRole("radio", { name: /Ipatinga/ }).click();

  // Categoria filtra a lista
  await page.getByRole("button", { name: "Japonês" }).click();
  await expect(page.getByRole("link", { name: /Sushi Vale Sakura/ })).toBeVisible();
  await expect(page.getByRole("link", { name: /Forno da Serra/ })).toHaveCount(0);
  await page.getByRole("button", { name: "Japonês" }).click();

  // Loja e item com opcional obrigatório
  await page.getByRole("link", { name: /Forno da Serra Pizzaria/ }).first().click();
  await expect(page.getByRole("heading", { name: "Forno da Serra Pizzaria" })).toBeVisible();
  await page.getByRole("button", { name: "Favoritar Forno da Serra Pizzaria" }).click();
  await expect(page.getByRole("button", { name: "Remover Forno da Serra Pizzaria dos favoritos" })).toBeVisible();
  expect(await overflow(page)).toBeLessThanOrEqual(0);
  await page.getByRole("button", { name: /^Margherita/ }).click();
  const sheet = page.getByTestId("item-sheet");
  await expect(sheet).toBeVisible();
  await sheet.getByRole("button", { name: /^Adicionar/ }).click();
  await expect(sheet.getByRole("alert")).toContainText("Escolha uma opção.");
  await sheet.getByLabel("Integral").check();
  await sheet.getByLabel(/Catupiry/).check();
  // 56,00 + 3,00 (integral) + 8,00 (catupiry)
  await expect(sheet.getByRole("button", { name: /^Adicionar/ })).toContainText("67,00");
  await sheet.getByRole("button", { name: /^Adicionar/ }).click();
  await expect(sheet).toHaveCount(0);

  // A barra "Ver sacola" fica acima da barra de baixo, sem sobrepor
  const view = page.getByTestId("view-bag");
  await expect(view).toBeVisible();
  const vb = (await view.boundingBox())!;
  const nb = (await bar.boundingBox())!;
  expect(vb.y + vb.height).toBeLessThanOrEqual(nb.y + 1);
  await view.click();
  await expect(page.getByRole("heading", { name: "Sua sacola" })).toBeVisible();
  expect(await overflow(page)).toBeLessThanOrEqual(0);
  await page.getByRole("link", { name: /^Continuar/ }).click();

  // Checkout: entrega (R$ 6,00) + Pix simulado
  await expect(page.getByRole("heading", { name: "Finalizar pedido" })).toBeVisible();
  await expect(page.getByTestId("food-total")).toContainText("73,00");
  expect(await overflow(page)).toBeLessThanOrEqual(0);
  const pay = page.getByRole("button", { name: /^Pagar com Pix/ });
  const pb = (await pay.boundingBox())!;
  expect(pb.y + pb.height).toBeLessThanOrEqual(nb.y + 1);
  await pay.click();

  // Acompanhamento: avança sozinho até entregue
  await page.waitForURL("**/passageiro/food/pedido/**");
  await expect(page.getByTestId("food-status-label")).toBeVisible();
  await expect(page.getByRole("list", { name: "Linha do tempo" })).toBeVisible();
  expect(await overflow(page)).toBeLessThanOrEqual(0);
  await expect(page.getByTestId("food-status-label")).toHaveText("Pedido aceito", { timeout: 15_000 });
  await expect(page.getByTestId("food-status-label")).toHaveText("Entregue", { timeout: 60_000 });

  // Ficha de pedidos: avaliar e reclamar; carrinho e favoritos
  await page.goto("/passageiro/food/pedidos");
  const mine = page.locator("[data-testid^=my-order-]").first();
  await expect(mine).toContainText("Forno da Serra Pizzaria");
  await expect(mine).toContainText("Entregue");
  expect(await overflow(page)).toBeLessThanOrEqual(0);
  await mine.getByRole("button", { name: "Avaliar pedido" }).click();
  await page.getByTestId("review-sheet").getByRole("radio", { name: "5 estrelas" }).click();
  await page.getByTestId("review-sheet").getByRole("button", { name: "Enviar avaliação" }).click();
  await expect(mine.getByText("Sua avaliação")).toBeVisible();
  await mine.getByRole("button", { name: "Reclamar da loja" }).click();
  await page.getByTestId("complaint-sheet").getByRole("button", { name: "Enviar reclamação" }).click();
  await expect(page.getByTestId("complaint-sheet").getByRole("alert")).toBeVisible();
  await page.getByTestId("complaint-sheet").getByRole("textbox").fill("A pizza chegou fria e sem borda.");
  await page.getByTestId("complaint-sheet").getByRole("button", { name: "Enviar reclamação" }).click();
  await expect(mine.getByText(/Reclamação registrada/)).toBeVisible();
  await page.goto("/passageiro/food/carrinho");
  await expect(page.getByRole("heading", { name: "Carrinho" })).toBeVisible();
  await expect(page.getByText("Seu carrinho está vazio")).toBeVisible();
  await page.getByRole("tab", { name: /Favoritos/ }).click();
  await expect(page.getByRole("link", { name: /Forno da Serra Pizzaria/ })).toBeVisible();
  expect(await overflow(page)).toBeLessThanOrEqual(0);

  // Painel da loja (host do app, qualquer logado) e lista de interesse
  await page.goto("/loja");
  await expect(page.getByTestId("food-demo-banner")).toContainText("qualquer pessoa logada");
  await expect(page.getByTestId("order-F4207")).toBeVisible();
  await expect(page.getByText(/Atraso: Sem resposta há 7 min/)).toBeVisible();
  await expect(page.getByText(/Atraso: Em preparo há 34 min/)).toBeVisible();
  await page.getByTestId("order-F4207").getByRole("button", { name: "Aceitar" }).click();
  await expect(page.getByTestId("order-F4207").getByText("Pedido aceito")).toBeVisible();
  expect(await overflow(page)).toBeLessThanOrEqual(0);
  await page.getByRole("tab", { name: "Quanto sobra" }).click();
  await page.getByRole("button", { name: "Quero minha loja no Orbi Food" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Combinado" })).toBeVisible();
  expect(await overflow(page)).toBeLessThanOrEqual(0);

  // Admin: seção Orbi Food e a calculadora
  const admin = await adminApi();
  const actx = await browser.newContext({ ...PHONE, baseURL: BASE, storageState: await admin.storageState() });
  // O painel só atende os endereços dos testes (ADMIN_ALLOWED_IPS): o navegador ganha um deles.
  await actx.setExtraHTTPHeaders({ "x-forwarded-for": "10.0.250.1" });
  const apage = await actx.newPage();
  await apage.goto("/admin/food");
  await expect(apage.getByRole("heading", { name: "Orbi Food" })).toBeVisible();
  await expect(apage.getByTestId("food-demo-banner")).toBeVisible();
  await apage.getByRole("tab", { name: "Calculadora" }).click();
  // 300 pedidos x R$ 45,00 = R$ 13.500: iFood Básico R$ 2.162,00; Orbi 14% = R$ 1.890,00; fica no bolso R$ 272,00 por mês
  await expect(apage.getByTestId("calc-savings-month")).toContainText("272,00");
  await expect(apage.getByTestId("calc-savings-year")).toContainText("3.264,00");
  await apage.getByLabel("Pedidos por mês").fill("1000");
  await apage.getByLabel("Ticket médio").fill("50,00");
  await expect(apage.getByTestId("calc-savings-month")).toContainText("710,00");
  await expect(apage.getByTestId("calc-ifood_entrega-fee")).toContainText("13.250,00");
  await expect(apage.getByTestId("calc-food99")).toContainText("Ainda não atende o Vale do Aço");
  expect(await overflow(apage)).toBeLessThanOrEqual(0);
  await apage.getByRole("tab", { name: "Comissões" }).click();
  await expect(apage.getByRole("cell", { name: /Entrega própria do restaurante/ })).toBeVisible();
  await apage.getByRole("tab", { name: "Visão geral" }).click();
  await expect(apage.getByText("Pedidos hoje (simulados)")).toBeVisible();

  // Página do logo
  await page.goto("/food-logo");
  await expect(page.getByRole("heading", { name: "Logo do Orbi Food" })).toBeVisible();
  await admin.dispose();
});

test("sem PRUMO_FOOD_DEMO as páginas do Food dão 404 (servidor de três endereços, sem o interruptor)", async () => {
  const PORT = 3103;
  const app = { host: `app.localhost:${PORT}`, origin: `http://app.localhost:${PORT}` };
  const c = await request.newContext({ baseURL: `http://localhost:${PORT}`, extraHTTPHeaders: { host: app.host, origin: app.origin, "x-forwarded-for": "10.9.250.7" }, maxRedirects: 0 });
  const id = Date.now().toString(36);
  const reg = await c.post("/api/auth/register", { data: { name: `Passageiro ${id}`, email: `food${id}@e2e.prumo.test`, password: "senha-de-teste", cpf: validCpf(), acceptPrivacy: true } });
  expect(reg.ok(), await reg.text()).toBeTruthy();
  const token = reg.headersArray().filter((h) => h.name.toLowerCase() === "set-cookie").map((h) => h.value.split(";")[0]).find((v) => v.startsWith("__Host-orbi_session="))!;
  const logged = await request.newContext({ baseURL: `http://localhost:${PORT}`, extraHTTPHeaders: { host: app.host, cookie: token, "x-forwarded-for": "10.9.250.8" }, maxRedirects: 0 });
  // Logado, a conta existe e o app abre; só o Food não.
  expect((await logged.get("/passageiro")).status()).toBe(200);
  for (const p of ["/passageiro/food", "/passageiro/food/forno-da-serra", "/loja"]) expect((await logged.get(p)).status(), p).toBe(404);
  const www = await request.newContext({ baseURL: `http://localhost:${PORT}`, extraHTTPHeaders: { host: `www.localhost:${PORT}` }, maxRedirects: 0 });
  expect((await www.get("/food-logo")).status()).toBe(404);
  // A API de interesse também fica fora do ar.
  const api = await request.newContext({ baseURL: `http://localhost:${PORT}`, extraHTTPHeaders: { host: app.host, origin: app.origin, cookie: token, "x-forwarded-for": "10.9.250.9" } });
  expect((await api.post("/api/public/food-interest", { data: {} })).status()).toBe(404);
});
