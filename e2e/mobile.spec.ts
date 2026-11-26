import { devices, expect, test, type Page } from "@playwright/test";
import { openTrip, adminApi, approvedDriverApi, BASE, IPATINGA, signUp, uniquePhone } from "./helpers";

/** Telas no celular: nada passa da largura da tela, e o botão de pedir nunca fica atrás da barra de baixo. */
const PHONES = {
  iPhone: { ...devices["iPhone 13"], defaultBrowserType: undefined },
  Android: { viewport: { width: 360, height: 780 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, userAgent: devices["Pixel 5"].userAgent },
};

const overflow = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

for (const [name, dev] of Object.entries(PHONES)) {
  test(`celular ${name}: telas cabem na largura e o pedido fica à mão`, async ({ browser }) => {
    test.setTimeout(300_000);
    const ctx = await browser.newContext({ ...dev, geolocation: IPATINGA, permissions: ["geolocation"], baseURL: BASE, reducedMotion: "reduce" });
    await ctx.addInitScript(() => { try { localStorage.setItem("prumo-cookies-ok", "1"); } catch { /* sem armazenamento */ } });
    const page = await ctx.newPage();
    for (const p of ["/", "/cidades/ipatinga", "/ajuda", "/motoristas", "/passageiros", "/contato", "/entrar"]) {
      await page.goto(p);
      expect(await overflow(page), `${p} passa da largura`).toBeLessThanOrEqual(0);
    }

    const admin = await adminApi();
    const d = await approvedDriverApi(admin);
    try {
      // A partida vem do GPS e o nome do endereço varia de uma execução para outra (o serviço real devolve o que está mais perto).
      // Fixamos um nome longo, que quebra em várias linhas no celular: era isso que empurrava o botão de pedir para trás da borda da folha.
      await page.route("**/api/geo/reverse*", (r) => r.fulfill({ json: { inArea: true, place: { label: "Centro Esportivo e Cultural 7 de Outubro", detail: "Avenida Marechal Cândido Rondon · Parque Ipanema · Ipatinga", lat: IPATINGA.latitude, lng: IPATINGA.longitude, kind: "place", inArea: true } } }));
      await signUp(page, "passageiro", uniquePhone(), "Bruna Teste Celular");
      await openTrip(page);
      await expect(page.getByRole("combobox", { name: "Partida" })).not.toHaveValue("", { timeout: 20000 });
      await page.route("**/api/geo/search*", (r) => r.fulfill({ json: { places: [{ label: "Shopping do Vale do Aço", detail: "Avenida Amazonas · Industrial · Ipatinga", lat: -19.4818, lng: -42.5262, kind: "place", inArea: true }] } }));
      await page.getByRole("combobox", { name: "Destino final" }).fill("Shopping");
      await page.getByRole("option").first().click();
      const pedir = page.getByRole("button", { name: /^Pedir / });
      await expect(pedir).toBeInViewport({ ratio: 1, timeout: 20000 });
      const b = await pedir.boundingBox();
      const nav = await page.getByRole("navigation", { name: "Passageiro" }).last().boundingBox();
      expect(b!.y + b!.height).toBeLessThanOrEqual(nav!.y + 1);
      expect(await overflow(page)).toBeLessThanOrEqual(0);

      const dctx = await browser.newContext({ ...dev, geolocation: IPATINGA, permissions: ["geolocation"], baseURL: BASE, reducedMotion: "reduce", storageState: await d.c.storageState() });
      const dpage = await dctx.newPage();
      for (const p of ["/motorista", "/motorista/ganhos", "/motorista/conta"]) {
        await dpage.goto(p);
        expect(await overflow(dpage), `${p} passa da largura`).toBeLessThanOrEqual(0);
      }
      await expect(dpage.getByRole("heading", { name: "Como você recebe" })).toBeVisible();
      const actx = await browser.newContext({ ...dev, baseURL: BASE, storageState: await admin.storageState() });
      const apage = await actx.newPage();
      for (const p of ["/admin", "/admin/configuracoes"]) {
        await apage.goto(p);
        expect(await overflow(apage), `${p} passa da largura`).toBeLessThanOrEqual(0);
      }
    } finally {
      await d.c.post("/api/driver/status", { data: { online: false } });
    }
  });
}

/** Páginas públicas que precisam caber em 360 px de largura (o celular mais estreito comum). */
const SITE_PAGES = ["/", "/como-funciona", "/passageiros", "/motoristas", "/motoristas/requisitos", "/clube", "/empresa", "/ajuda", "/contato", "/interesse", "/parceiros", "/cidades/ipatinga", "/privacidade", "/termos", "/status", "/entrar", "/cadastro"];
const overlaps = (a: { x: number; y: number; width: number; height: number }, b: { x: number; y: number; width: number; height: number }) =>
  a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

test("celular 360: sem rolagem lateral, aviso de cookies compacto e menu do site", async ({ browser }) => {
  test.setTimeout(240_000);
  const ctx = await browser.newContext({ ...PHONES.Android, baseURL: BASE, viewport: { width: 360, height: 740 } });
  const page = await ctx.newPage();
  try {
    // Primeira visita: o aviso de cookies aparece, mas como uma faixa curta que não cobre os campos do formulário do hero.
    await page.goto("/");
    const notice = page.getByRole("region", { name: "Aviso de cookies" });
    await expect(notice).toBeVisible();
    const nb = (await notice.boundingBox())!;
    expect(nb.height, "aviso de cookies deve ser uma faixa de 1 a 3 linhas").toBeLessThanOrEqual(84);
    const hero = page.locator("#pedir");
    for (const target of [page.getByRole("combobox", { name: "Local de partida" }), page.getByRole("combobox", { name: "Local de chegada" }), hero.getByRole("button", { name: /Ver preços/ })]) {
      await expect(target).toBeVisible();
      expect(overlaps((await target.boundingBox())!, nb), "o aviso cobre um campo do hero").toBeFalsy();
    }
    expect(await overflow(page)).toBeLessThanOrEqual(0);
    // No celular o hero não tem a ilustração do telefone (uma ideia por tela): só título, uma frase e o formulário.
    await expect(page.locator("section.hero-light div[aria-hidden='true'][class*='rounded-[48px]']").first()).toBeHidden();
    await expect(page.getByText("Experimente aqui embaixo")).toBeHidden();
    // A página inteira cabe em ~5 telas (eram 7,7 depois do primeiro ajuste e 9,5 antes).
    expect(await page.evaluate(() => document.documentElement.scrollHeight)).toBeLessThan(740 * 5);

    // Menu hambúrguer: abre, mostra os links com alvo de toque de 44 px e os botões de conta, e fecha.
    await page.getByRole("button", { name: "Abrir menu" }).click();
    const menu = page.getByRole("navigation", { name: "Menu" });
    await expect(menu).toBeVisible();
    for (const link of await menu.getByRole("link").all()) expect((await link.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    await expect(menu.getByRole("link", { name: "Criar conta" })).toBeVisible();
    await expect(menu.getByRole("link", { name: "Entrar", exact: true })).toBeVisible();
    expect(await overflow(page)).toBeLessThanOrEqual(0);
    await page.getByRole("button", { name: "Fechar menu" }).click();
    await expect(menu).toBeHidden();

    // "Entendi" dispensa o aviso e ele não volta.
    await notice.getByRole("button", { name: "Entendi" }).click();
    await expect(notice).toBeHidden();
    await page.reload();
    await expect(notice).toBeHidden();

    for (const p of SITE_PAGES) {
      await page.goto(p);
      await page.waitForLoadState("load");
      expect(await overflow(page), `${p} passa da largura`).toBeLessThanOrEqual(0);
      // Campos com pelo menos 16 px: abaixo disso o iPhone dá zoom ao tocar.
      const small = await page.evaluate(() => [...document.querySelectorAll("input:not([type=checkbox]):not([type=radio]):not([type=range]):not([type=hidden]), select, textarea")]
        .filter((el) => (el as HTMLElement).offsetParent && parseFloat(getComputedStyle(el).fontSize) < 16).map((el) => (el as HTMLInputElement).name || el.tagName));
      expect(small, `${p}: campos com letra menor que 16 px`).toEqual([]);
    }
  } finally {
    await ctx.close();
  }
});

test("celular 360: tabelas do painel viram cartões, sem rolagem lateral", async ({ browser }) => {
  const admin = await adminApi();
  const ctx = await browser.newContext({ ...PHONES.Android, baseURL: BASE, viewport: { width: 360, height: 740 }, storageState: await admin.storageState(), extraHTTPHeaders: { "x-forwarded-for": "10.0.250.1" } });
  const page = await ctx.newPage();
  try {
    for (const p of ["/admin/usuarios", "/admin/viagens", "/admin/tarifas", "/admin/regioes"]) {
      await page.goto(p);
      await expect(page.locator("main h1").first()).toBeVisible();
      expect(await overflow(page), `${p} passa da largura`).toBeLessThanOrEqual(0);
      const table = page.locator("table").first();
      if (await table.count()) {
        // Os cartões cabem na tela: nenhuma célula passa da borda direita.
        const wide = await page.evaluate(() => [...document.querySelectorAll("main table td")].filter((td) => td.getBoundingClientRect().right > innerWidth + 1).length);
        expect(wide, `${p}: células fora da tela`).toBe(0);
      }
    }
  } finally {
    await ctx.close();
  }
});
