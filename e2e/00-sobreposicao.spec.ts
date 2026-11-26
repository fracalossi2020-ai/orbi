import { expect, test, type Page } from "@playwright/test";
import { openTrip, adminApi, approvedDriverApi, registerApi, RIDE_BODY, BASE, IPATINGA, signUp, uniquePhone } from "./helpers";

/**
 * Roda primeiro (00-) de propósito: o motorista da oferta precisa ser o único online, o que só vale antes de os outros testes deixarem motoristas ligados.
 * Celular (360 px): nada de texto visível por baixo do botão fixo do pedido nem da barra de baixo.
 * Rola tudo até o fim e confere, pelas caixas dos elementos de texto, que nenhum encosta nas barras fixas.
 */
const PHONE = { viewport: { width: 360, height: 740 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true };

/** Rola a página e toda área rolável até o fim e devolve os textos visíveis que cruzam as barras fixas. */
async function overlaps(page: Page, barSelectors: string[]) {
  await page.evaluate(() => {
    window.scrollTo(0, document.documentElement.scrollHeight);
    for (const el of Array.from(document.querySelectorAll<HTMLElement>("*"))) {
      const o = getComputedStyle(el).overflowY;
      if ((o === "auto" || o === "scroll") && el.scrollHeight > el.clientHeight) el.scrollTop = el.scrollHeight;
    }
  });
  await page.waitForTimeout(400);
  return page.evaluate((sels) => {
    const bars = sels.flatMap((s) => Array.from(document.querySelectorAll<HTMLElement>(s))).filter((b) => b.checkVisibility());
    const rects = bars.map((b) => b.getBoundingClientRect());
    const hits: string[] = [];
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      const text = n.textContent?.trim();
      const el = n.parentElement;
      if (!text || !el || !el.checkVisibility()) continue;
      if (bars.some((b) => b.contains(el))) continue;
      const range = document.createRange();
      range.selectNodeContents(n);
      const r = range.getBoundingClientRect();
      if (r.width === 0 || r.height === 0 || r.bottom < 0 || r.top > innerHeight) continue;
      // Só conta o que um olho veria: se o texto está recortado por um ancestral que rola ou corta, usa a parte visível.
      let top = r.top, bottom = r.bottom;
      for (let a: HTMLElement | null = el; a && a !== document.body; a = a.parentElement) {
        const cs = getComputedStyle(a);
        if (cs.overflowY !== "visible") { const ar = a.getBoundingClientRect(); top = Math.max(top, ar.top); bottom = Math.min(bottom, ar.bottom); }
      }
      if (bottom <= top) continue;
      rects.forEach((b, i) => {
        if (top < b.bottom - 1 && bottom > b.top + 1 && r.left < b.right && r.right > b.left) hits.push(`${text.slice(0, 40)} x ${sels[i] ?? "barra"}`);
      });
    }
    return hits;
  }, barSelectors);
}

test("celular 360: nenhum texto passa por baixo do botão de pedir nem da barra de baixo", async ({ browser }) => {
  test.setTimeout(240_000);
  const ctx = await browser.newContext({ ...PHONE, geolocation: IPATINGA, permissions: ["geolocation"], baseURL: BASE, reducedMotion: "reduce" });
  await ctx.addInitScript(() => { try { localStorage.setItem("prumo-cookies-ok", "1"); } catch { /* sem armazenamento */ } });
  const page = await ctx.newPage();
  const admin = await adminApi();
  const d = await approvedDriverApi(admin);
  try {
    await page.route("**/api/geo/reverse*", (r) => r.fulfill({ json: { inArea: true, place: { label: "Centro Esportivo e Cultural 7 de Outubro", detail: "Avenida Marechal Cândido Rondon · Parque Ipanema · Ipatinga", lat: IPATINGA.latitude, lng: IPATINGA.longitude, kind: "place", inArea: true } } }));
    await signUp(page, "passageiro", uniquePhone(), "Bruna Sem Sobreposicao");
    await openTrip(page);
    await expect(page.getByRole("combobox", { name: "Partida" })).not.toHaveValue("", { timeout: 20000 });
    await page.route("**/api/geo/search*", (r) => r.fulfill({ json: { places: [{ label: "Shopping do Vale do Aço", detail: "Avenida Amazonas · Industrial · Ipatinga", lat: -19.4818, lng: -42.5262, kind: "place", inArea: true }] } }));
    await page.getByRole("combobox", { name: "Destino final" }).fill("Shopping");
    await page.getByRole("option").first().click();
    const pedir = page.getByRole("button", { name: /^Pedir / });
    await expect(pedir).toBeInViewport({ ratio: 1, timeout: 20000 });
    // O wrapper fixo do botão de pedir é o pai direto dele.
    await pedir.evaluate((b) => { b.parentElement!.setAttribute("data-barra-pedir", ""); });
    const navSel = 'nav[aria-label="Passageiro"]';
    // Abre as opções extras para a folha ficar o mais comprida possível.
    await page.getByRole("button", { name: /Mais opções/ }).click();
    expect(await overlaps(page, ["[data-barra-pedir]", navSel])).toEqual([]);

    // Motorista: oferta e corrida em andamento (botões fixos acima do menu).
    const p2 = await registerApi("Passageiro");
    const dctx = await browser.newContext({ ...PHONE, geolocation: IPATINGA, permissions: ["geolocation"], baseURL: BASE, reducedMotion: "reduce", storageState: await d.c.storageState(), extraHTTPHeaders: { "x-forwarded-for": "10.9.9.9" } });
    await dctx.addInitScript(() => { try { localStorage.setItem("prumo-cookies-ok", "1"); } catch { /* sem armazenamento */ } });
    const dpage = await dctx.newPage();
    await dpage.goto("/motorista");
    await expect(dpage.getByTestId("online-state")).toBeVisible({ timeout: 20000 });
    const ride = await (await p2.c.post("/api/rides", { data: RIDE_BODY(d.categoryId, { paymentMethod: "cash" }) })).json();
    await expect(dpage.getByTestId("offer")).toBeVisible({ timeout: 30000 });
    expect(await overlaps(dpage, ['nav[aria-label="Motorista"]'])).toEqual([]);
    await dpage.getByRole("button", { name: "Aceitar" }).click();
    await expect(dpage.getByTestId("active-ride")).toBeVisible({ timeout: 20000 });
    expect(await overlaps(dpage, ['nav[aria-label="Motorista"]'])).toEqual([]);
    await p2.c.post(`/api/rides/${ride.id}/cancel`, { data: {} }).catch(() => undefined);

    // Painel e /entrar não têm barra fixa embaixo; a conferência visual deles está nos prints.
  } finally {
    await d.c.post("/api/driver/status", { data: { online: false } });
  }
});
