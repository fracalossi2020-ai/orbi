import fs from "node:fs";
import path from "node:path";
import { expect, request, type APIRequestContext, type Browser, type BrowserContext, type Page } from "@playwright/test";
import { makeCnh, randomDigits, validCpf } from "./documents";

export const BASE = "http://localhost:3100";
export const PASSWORD = "senha-de-teste";
/** Chave Pix de teste (celular) do motorista; o saque só vai para ela. */
export const TEST_PIX = { pixKeyType: "phone", pixKey: "(31) 99999-8888" };
export const IPATINGA = { latitude: -19.4683, longitude: -42.5367 };
export const ADMIN = { identifier: "admin@e2e.prumo.test", password: "e2e-admin-password" };

let seq = 0;
export const unique = () => `${Date.now().toString(36)}${(seq++).toString(36)}`;
const digits = randomDigits;
export { makeCnh, validCpf };

export const DRIVER_ADDRESS = { cep: "35160039", number: "100" };
/** Regularização do motorista de teste: maior de idade, CNH B com EAR, válida, habilitado há anos. */
export const DRIVER_REG = { birthDate: "1990-05-10", cnhCategory: "B", cnhFirstLicenseAt: "2012-03-01", cnhExpiresAt: `${new Date().getFullYear() + 4}-12-31`, cnhEar: true, inss: true, acceptTerms: true };
export const VEHICLE_REG = { doors: 4, seats: 5, airConditioning: true, ownership: "proprio", noRedPlate: true };
/** Documentos exigidos pelo padrão do painel. */
export const REQUIRED_DOCS = ["cnh", "crlv", "selfie", "antecedentes", "residencia"];

let clientSeq = 0;
/** Cada cliente tem o próprio endereço: assim os limites por endereço valem por cenário, não para a suíte toda. */
const nextAddress = () => `10.0.${Math.floor(++clientSeq / 200)}.${clientSeq % 200}`;
export async function apiClient() { return request.newContext({ baseURL: BASE, extraHTTPHeaders: { "x-forwarded-for": nextAddress() } }); }

/**
 * O navegador também ganha endereço próprio: sem isso, todos os cadastros pela tela saem do mesmo endereço
 * e somam no limite de consultas da entrada (celular, CPF e e-mail contam a cada cadastro).
 */
export async function ownAddress(page: Page) {
  await page.context().setExtraHTTPHeaders({ "x-forwarded-for": nextAddress() });
}

export async function adminApi() {
  const c = await apiClient();
  expect((await c.post("/api/auth/login", { data: ADMIN })).ok()).toBeTruthy();
  return c;
}

export const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=", "base64");

/**
 * Conta nova só pela API. O cadastro público cria sempre passageiro e exige CPF válido;
 * para virar motorista, a própria pessoa pede depois, dentro da conta.
 */
export async function registerApi(kind: "Passageiro" | "Motorista" = "Passageiro", extra: object = {}) {
  const c = await apiClient();
  const id = unique();
  const cpf = validCpf();
  const reg = await c.post("/api/auth/register", { data: { name: `${kind} ${id}`, email: `${kind[0].toLowerCase()}${id}@e2e.prumo.test`, password: "senha-de-teste", cpf, acceptPrivacy: true, ...extra } });
  expect(reg.ok(), await reg.text()).toBeTruthy();
  const userId = (await (await c.get("/api/me")).json()).user.id as string;
  return { c, userId, cpf };
}

/** Passageiro que passa a ser motorista (ainda sem cadastro de motorista enviado). */
export async function driverAccountApi() {
  const acc = await registerApi("Motorista");
  const become = await acc.c.post("/api/account/become-driver", { data: {} });
  expect(become.ok(), await become.text()).toBeTruthy();
  expect((await become.json()).role).toBe("driver");
  return acc;
}

/** Cria e aprova um motorista só com a API, para cenários que não testam o cadastro. */
export async function approvedDriverApi(admin: APIRequestContext, lat = IPATINGA.latitude, lng = IPATINGA.longitude) {
  const { c, userId, cpf } = await driverAccountApi();
  const state = await (await c.get("/api/driver/state")).json();
  const region = state.regions.find((r: { name: string }) => r.name === "Ipatinga");
  // O CPF do cadastro de motorista é o mesmo da conta.
  expect((await c.post("/api/driver/onboarding", { data: { cpf, cnh: makeCnh(), regionId: region.id, ...DRIVER_ADDRESS, ...DRIVER_REG } })).ok()).toBeTruthy();
  for (const kind of REQUIRED_DOCS) {
    const up = await c.post("/api/driver/documents", { multipart: { kind, file: { name: "d.png", mimeType: "image/png", buffer: PNG } } });
    expect(up.ok()).toBeTruthy();
    expect((await admin.post(`/api/admin/documents/${(await up.json()).id}`, { data: { status: "approved" } })).ok()).toBeTruthy();
  }
  const cat = state.categories.find((x: { slug?: string; name: string }) => x.name === "Essencial");
  const letter = () => String.fromCharCode(65 + Math.floor(Math.random() * 26));
  const plate = `${letter()}${letter()}${letter()}${digits(1)}${letter()}${digits(2)}`;
  const v = await c.post("/api/driver/vehicle", { data: { categoryId: cat.id, make: "Marca", model: "Modelo", color: "Prata", plate, year: 2022, ...VEHICLE_REG } });
  expect(v.ok()).toBeTruthy();
  expect((await admin.post(`/api/admin/vehicles/${(await v.json()).id}`, { data: { status: "approved" } })).ok()).toBeTruthy();
  expect((await admin.post(`/api/admin/drivers/${userId}`, { data: { status: "approved" } })).ok()).toBeTruthy();
  expect((await c.post("/api/driver/status", { data: { online: true, lat, lng } })).ok()).toBeTruthy();
  return { c, userId, cpf, categoryId: cat.id as string };
}

export async function passengerApi() {
  return (await registerApi("Passageiro")).c;
}

export const RIDE_BODY = (categoryId: string, extra: object = {}) => ({
  origin: { label: "Origem de teste", lat: -19.47, lng: -42.54 }, dest: { label: "Destino de teste", lat: -19.5186, lng: -42.6289 },
  categoryId, paymentMethod: "cash", ...extra,
});

/** Coordenadas da partida e do destino de RIDE_BODY. */
export const RIDE_ORIGIN = { lat: -19.47, lng: -42.54 };
export const RIDE_DEST = { lat: -19.5186, lng: -42.6289 };

/**
 * Anda a corrida como o motorista de verdade: posiciona o celular na partida antes de "cheguei" e no destino antes de
 * "encerrar" (o servidor confere a posição). Os testes sobem com PRUMO_RIDE_GUARDS=strict e sem tempo mínimo.
 */
export async function driveRide(c: APIRequestContext, rideId: string, steps: ("arrive" | "start" | "complete")[] = ["arrive", "start", "complete"]) {
  for (const a of steps) {
    if (a === "arrive") await c.post("/api/driver/location", { data: RIDE_ORIGIN });
    if (a === "complete") await c.post("/api/driver/location", { data: RIDE_DEST });
    const r = await c.post(`/api/rides/${rideId}/${a}`, { data: {} });
    expect(r.ok(), `${a}: ${await r.text()}`).toBeTruthy();
  }
}

export async function gpsContext(browser: Browser): Promise<BrowserContext> {
  return browser.newContext({ geolocation: IPATINGA, permissions: ["geolocation"], baseURL: BASE, viewport: { width: 420, height: 860 } });
}

/** Botão ou link pelo nome visível (a tela pode trocar um pelo outro sem mudar o que a pessoa vê). */
export const action = (page: Page, name: string | RegExp) => page.getByRole("button", { name }).or(page.getByRole("link", { name })).first();

/**
 * A entrada abre no login direto (celular ou e-mail + senha). Os passos de celular/e-mail, que levam ao cadastro
 * ou à senha de quem já tem conta, ficam em ?etapa=celular e ?etapa=email (mantendo o perfil da URL).
 */
export async function chooseEntry(page: Page, kind: "celular" | "e-mail") {
  const field = kind === "celular" ? page.getByLabel("Celular com DDD") : page.getByLabel("E-mail", { exact: true });
  // Sempre pelo endereço: a tela inicial muda conforme o aparelho (primeira vez abre em "criar conta").
  await page.waitForLoadState();
  const want = kind === "celular" ? "celular" : "email";
  const u = new URL(page.url());
  if (u.searchParams.get("etapa") !== want) {
    u.searchParams.set("etapa", want);
    await page.goto(u.toString());
  }
  await expect(field).toBeVisible({ timeout: 20000 });
}

/** "Continuar" exato: os botões "Continuar com …" não podem ser confundidos com o avanço de etapa. */
export const advance = (page: Page) => page.getByRole("button", { name: "Continuar", exact: true }).click();

/**
 * Preenche o cadastro pela entrada única, etapa por etapa, e para logo depois de "Criar conta".
 * Devolve o CPF usado (só dígitos).
 */
export async function fillSignUp(page: Page, perfil: "motorista" | "passageiro" | null, phone: string, name: string, goTo = true, cpf = validCpf()) {
  await ownAddress(page);
  if (goTo) await page.goto(perfil ? `/cadastro?perfil=${perfil}` : "/entrar");
  await chooseEntry(page, "celular");
  await page.getByLabel("Celular com DDD").fill(phone);
  await advance(page);
  await page.getByLabel("Nome completo").fill(name);
  await advance(page);
  await page.getByLabel("CPF").fill(cpf);
  await advance(page);
  await page.getByLabel("E-mail de contato").fill(`c${phone}@e2e.prumo.test`);
  await advance(page);
  await page.getByLabel("Nova senha").fill("senha-de-teste");
  await page.locator('input[name="accept"]').check();
  await page.getByRole("button", { name: "Criar conta" }).click();
  return cpf;
}

/**
 * Cria a conta pela entrada única. Toda conta nasce passageiro; pelo link de motorista ela cai em
 * "Seja motorista" (/passageiro/dirigir) e, com o botão, segue para o cadastro de motorista em /motorista.
 */
export async function signUp(page: Page, perfil: "motorista" | "passageiro", phone: string, name: string, goTo = true) {
  const cpf = await fillSignUp(page, perfil, phone, name, goTo);
  if (perfil === "motorista") {
    await page.waitForURL(/\/passageiro\/dirigir(\?|$)/);
    await page.getByRole("button", { name: "Quero ser motorista" }).click();
    await page.waitForURL(/\/motorista(\?|$)/);
  } else {
    await page.waitForURL("**/passageiro");
  }
  return cpf;
}

/** Último código enviado para o endereço, lido da caixa de saída local dos testes. */
export function lastCode(email: string) {
  const dir = path.join(process.cwd(), ".data-e2e", "outbox");
  const file = fs.readdirSync(dir).filter((f) => f.includes(email)).sort().at(-1);
  if (!file) throw new Error(`Nenhum e-mail para ${email}`);
  return fs.readFileSync(path.join(dir, file), "utf8").match(/\b(\d{6})\b/)![1];
}

export const uniquePhone = () => `319${digits(8)}`;

export async function login(page: Page, identifier: string, password: string) {
  await ownAddress(page);
  // ?etapa=login: abre no login mesmo num navegador que nunca entrou (a primeira vez abre em "criar conta")
  await page.goto("/entrar?etapa=login");
  // Login direto na primeira tela: celular ou e-mail no mesmo campo
  await page.getByLabel("Celular ou e-mail").fill(identifier);
  await page.getByLabel("Senha", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
}

/** Celular: o app abre na tela de início; tocar em "Para onde?" abre o pedido com o mapa. No computador, não faz nada. */
export async function openTrip(page: Page) {
  const start = page.getByTestId("passenger-start");
  await expect(start.or(page.getByRole("combobox", { name: "Partida" })).first()).toBeVisible({ timeout: 20000 });
  if (await start.isVisible()) await start.getByRole("button", { name: "Para onde?", exact: true }).click();
}
