import { expect, test } from "@playwright/test";
import { action, adminApi, advance, apiClient, approvedDriverApi, BASE, chooseEntry, fillSignUp, ownAddress, passengerApi, registerApi, RIDE_BODY, unique, uniquePhone, validCpf } from "./helpers";

test.describe.configure({ mode: "serial" });

test("entrada: Google e Apple aparecem mesmo sem configuração; Apple avisa que chega em breve", async ({ page }) => {
  // Mesmo com o Google desligado no servidor, o botão continua na tela (a configuração vem depois).
  await page.route("**/api/auth/google/status*", (r) => r.fulfill({ json: { enabled: false, pending: null } }));
  await page.goto("/entrar?etapa=login");
  await expect(action(page, "Continuar com Google")).toBeVisible();
  await expect(action(page, "Continuar com Apple")).toBeVisible();
  // Login direto na primeira tela, com criar conta logo abaixo
  await expect(page.getByLabel("Celular ou e-mail")).toBeVisible();
  await expect(page.getByLabel("Senha", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Entrar", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Criar conta" })).toBeVisible();
  // Apple ainda não funciona: tocar mostra o aviso e não sai da tela
  const apple = action(page, "Continuar com Apple");
  if (await apple.isEnabled()) await apple.click();
  await expect(page.getByText(/Apple.*em breve/i)).toBeVisible();
  await expect(page).toHaveURL(/\/entrar/);
});

test("entrada: primeira vez no aparelho abre em criar conta; quem já entrou vê o login", async ({ page }) => {
  await page.goto("/entrar");
  await expect(page.getByRole("heading", { name: "Crie sua conta" })).toBeVisible();
  await expect(page.getByLabel("Celular com DDD")).toBeVisible();
  await expect(action(page, "Continuar com Google")).toBeVisible();
  // "Já tem conta? Entrar" leva ao login
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await expect(page.getByLabel("Celular ou e-mail")).toBeVisible();
  // Aparelho que já entrou alguma vez: a entrada abre no login
  await page.evaluate(() => localStorage.setItem("orbi-conta", "1"));
  await page.goto("/entrar");
  await expect(page.getByLabel("Celular ou e-mail")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Crie sua conta" })).toHaveCount(0);
  // "Criar conta" do site abre o cadastro mesmo para quem já entrou
  await page.goto("/cadastro");
  await expect(page.getByRole("heading", { name: "Crie sua conta" })).toBeVisible();
});

test("cadastro: CPF inválido mostra erro e CPF de outra conta é recusado", async ({ browser }) => {
  const api = await apiClient();
  const taken = validCpf();
  const reg = (data: object) => api.post("/api/auth/register", { data: { name: "Clara Teste Documento", password: "senha-de-teste", acceptPrivacy: true, phone: uniquePhone(), ...data } });
  expect((await reg({ cpf: taken })).ok()).toBeTruthy();

  // Pela API: sem CPF, CPF com conta errada e CPF repetido
  expect((await reg({})).status()).toBe(400);
  expect((await reg({ cpf: "12345678900" })).status()).toBe(400);
  expect((await reg({ cpf: "00000000000" })).status()).toBe(400);
  const dup = await reg({ cpf: taken });
  expect(dup.ok()).toBeFalsy();
  expect((await dup.json()).error).toMatch(/^Este CPF já está em outra conta\..*suporte/);
  // A consulta avisa antes de chegar à senha
  const lookup = await apiClient();
  expect(await (await lookup.post("/api/auth/lookup", { data: { cpf: taken } })).json()).toEqual({ exists: true });
  expect(await (await lookup.post("/api/auth/lookup", { data: { cpf: validCpf() } })).json()).toEqual({ exists: false });

  // Pela tela
  const ctx = await browser.newContext({ baseURL: BASE });
  const page = await ctx.newPage();
  await ownAddress(page);
  await page.goto("/cadastro?perfil=passageiro");
  await chooseEntry(page, "celular");
  await page.getByLabel("Celular com DDD").fill(uniquePhone());
  await advance(page);
  await page.getByLabel("Nome completo").fill("Caio Teste Documento");
  await advance(page);
  await page.getByLabel("CPF").fill("123.456.789-00");
  await advance(page);
  await expect(page.getByRole("alert").filter({ hasText: "CPF" }).first()).toBeVisible();
  await expect(page.getByLabel("E-mail de contato")).toHaveCount(0);
  await page.getByLabel("CPF").fill(taken);
  await advance(page);
  await expect(page.getByText("Este CPF já está em outra conta.")).toBeVisible();
  await expect(page.getByLabel("E-mail de contato")).toHaveCount(0);
  // Com um CPF válido e livre, segue para o e-mail
  await page.getByLabel("CPF").fill(validCpf());
  await advance(page);
  await expect(page.getByLabel("E-mail de contato")).toBeVisible();
  await ctx.close();
});

test("link de motorista: conta de passageiro, página Seja motorista e depois o cadastro de motorista", async ({ browser }) => {
  const ctx = await browser.newContext({ baseURL: BASE });
  const page = await ctx.newPage();
  const cpf = await fillSignUp(page, "motorista", uniquePhone(), "Marta Teste Dirigir");
  await page.waitForURL(/\/passageiro\/dirigir(\?|$)/);
  // Até tocar no botão, a conta é de passageiro
  expect((await (await page.request.get("/api/me")).json()).user.role).toBe("passenger");
  await page.getByRole("button", { name: "Quero ser motorista" }).click();
  await page.waitForURL(/\/motorista(\?|$)/);
  expect((await (await page.request.get("/api/me")).json()).user.role).toBe("driver");
  // O cadastro de motorista já vem com o CPF da conta
  await expect.poll(async () => (await page.getByLabel("CPF").inputValue()).replace(/\D/g, "")).toBe(cpf);
  // Quem já é motorista e abre "Seja motorista" volta para o app do motorista
  await page.goto("/passageiro/dirigir");
  await page.waitForURL(/\/motorista(\?|$)/);
  // Pedir de novo é recusado
  const again = await page.request.post("/api/account/become-driver", { data: {} });
  expect(again.status()).toBe(400);
  expect((await again.json()).error).toBe("Sua conta já é de motorista.");
  await ctx.close();
});

test("passageiro já logado abre Seja motorista; equipe não vira motorista", async ({ browser }) => {
  const { c } = await registerApi("Passageiro");
  const ctx = await browser.newContext({ baseURL: BASE, storageState: await c.storageState() });
  const page = await ctx.newPage();
  await page.goto("/passageiro/dirigir");
  await expect(page.getByRole("button", { name: "Quero ser motorista" })).toBeVisible();
  await expect(page).toHaveURL(/\/passageiro\/dirigir/);
  await ctx.close();

  const admin = await adminApi();
  expect((await admin.post("/api/account/become-driver", { data: {} })).status()).toBe(403);
  expect((await (await apiClient()).post("/api/account/become-driver", { data: {} })).ok()).toBeFalsy();
});

test("motorista também viaja: online não pede corrida e o despacho nunca oferece a corrida a quem pediu", async () => {
  const admin = await adminApi();
  const d = await approvedDriverApi(admin);
  const other = await approvedDriverApi(admin, -19.4705, -42.5405);
  let rideId: string | null = null;
  try {
    // Online: precisa ficar offline antes
    const blocked = await d.c.post("/api/rides", { data: RIDE_BODY(d.categoryId) });
    expect(blocked.ok()).toBeFalsy();
    expect((await blocked.json()).error).toBe("Fique offline para pedir uma corrida.");

    // Offline: usa as telas e APIs de passageiro normalmente
    expect((await d.c.post("/api/driver/status", { data: { online: false } })).ok()).toBeTruthy();
    expect((await d.c.get("/api/rides")).ok()).toBeTruthy();
    const ride = await (await d.c.post("/api/rides", { data: RIDE_BODY(d.categoryId) })).json();
    expect(ride.status).toBe("searching");
    rideId = ride.id as string;

    // A oferta vai para outro motorista
    await expect.poll(async () => (await (await other.c.get("/api/driver/state")).json()).offer?.id ?? null, { timeout: 20000 }).not.toBeNull();
    const offer = (await (await other.c.get("/api/driver/state")).json()).offer;

    // Se quem pediu ficar online (com a própria corrida procurando), a recusa do outro não manda a corrida para ele
    const back = await d.c.post("/api/driver/status", { data: { online: true, lat: -19.4701, lng: -42.5401 } });
    expect((await other.c.post(`/api/driver/offers/${offer.id}`, { data: { accept: false } })).ok()).toBeTruthy();
    if (back.ok()) {
      for (let i = 0; i < 4; i++) {
        await new Promise((r) => setTimeout(r, 1000));
        expect((await (await d.c.get("/api/driver/state")).json()).offer).toBeNull();
      }
    }
  } finally {
    if (rideId) await d.c.post(`/api/rides/${rideId}/cancel`, { data: { reason: "teste" } });
    for (const x of [d, other]) await x.c.post("/api/driver/status", { data: { online: false } });
  }
});

test("passageiro comum continua sem acesso ao app do motorista", async () => {
  const p = await passengerApi();
  expect((await p.get("/api/driver/state")).status()).toBe(403);
  expect((await p.post("/api/driver/status", { data: { online: true, lat: -19.47, lng: -42.54 } })).status()).toBe(403);
  // E o cadastro público não aceita papel no corpo
  const c = await apiClient();
  const res = await c.post("/api/auth/register", { data: { name: "Pedro Teste Papel", email: `papel${unique()}@e2e.prumo.test`, password: "senha-de-teste", cpf: validCpf(), role: "driver", acceptPrivacy: true } });
  expect(res.ok()).toBeTruthy();
  expect((await res.json()).role).toBe("passenger");
});
