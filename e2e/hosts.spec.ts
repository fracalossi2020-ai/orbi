import { expect, request, test, type APIResponse } from "@playwright/test";
import { validCpf } from "./documents";

/**
 * Modo com três endereços (www / app / admin), no servidor da porta 3103 (scripts/e2e-hosts-server.ts).
 * O Node deste computador não resolve *.localhost, então as chamadas de API vão para localhost:3103 com o cabeçalho Host
 * de cada host (é o que o proxy lê). O navegador (Chromium) resolve *.localhost sozinho e é usado no teste de tela.
 */
const PORT = 3103;
const HOSTS = { www: `www.localhost:${PORT}`, app: `app.localhost:${PORT}`, admin: `admin.localhost:${PORT}` } as const;
type Role = keyof typeof HOSTS;
const ORIGIN = (r: Role) => `http://${HOSTS[r]}`;
const ADMIN = { identifier: "admin@e2e.prumo.test", password: "e2e-admin-password" };

let seq = 0;
const ip = () => `10.9.${Math.floor(++seq / 200)}.${seq % 200}`;

/** Cliente sem jar de cookies automático: cada teste manda o Cookie que quer (e vê o Set-Cookie que o servidor devolve). */
async function client(role: Role, extra: Record<string, string> = {}) {
  return request.newContext({ baseURL: `http://localhost:${PORT}`, extraHTTPHeaders: { host: HOSTS[role], "x-forwarded-for": ip(), ...extra }, maxRedirects: 0 });
}

const setCookies = (r: APIResponse) => r.headersArray().filter((h) => h.name.toLowerCase() === "set-cookie").map((h) => h.value);
/** Valor do cookie com este nome no Set-Cookie. */
const cookieValue = (r: APIResponse, name: string) => setCookies(r).map((c) => c.split(";")[0]).find((c) => c.startsWith(`${name}=`))?.slice(name.length + 1);

async function loginAdmin() {
  const c = await client("admin", { origin: ORIGIN("admin") });
  const r = await c.post("/api/auth/login", { data: ADMIN });
  expect(r.ok(), await r.text()).toBeTruthy();
  const token = cookieValue(r, "__Host-orbi_admin");
  expect(token).toBeTruthy();
  return { r, token: token! };
}

async function registerPassenger() {
  const c = await client("app", { origin: ORIGIN("app") });
  const id = `${Date.now().toString(36)}${seq++}`;
  const email = `p${id}@e2e.prumo.test`;
  const r = await c.post("/api/auth/register", { data: { name: `Passageiro ${id}`, email, password: "senha-de-teste", cpf: validCpf(), acceptPrivacy: true } });
  expect(r.ok(), await r.text()).toBeTruthy();
  const token = cookieValue(r, "__Host-orbi_session");
  expect(token).toBeTruthy();
  return { r, token: token!, email };
}

/** /api/me responde 200 também a visitante ({ user: null }): o que importa é quem o servidor enxerga. */
const whoAmI = async (c: Awaited<ReturnType<typeof client>>) => (await (await c.get("/api/me")).json()).user as { role: string } | null;

test.describe.configure({ mode: "serial" });

test.describe("três endereços: quem serve o quê", () => {
  test("host desconhecido recebe 421 (nada de Host do pedido)", async () => {
    const c = await request.newContext({ baseURL: `http://localhost:${PORT}`, maxRedirects: 0 });
    expect((await c.get("/")).status()).toBe(421);
    const evil = await client("www", { host: "evil.test" });
    expect((await evil.get("/api/public/pulse")).status()).toBe(421);
  });

  test("/api/admin no host do app e do www dá 404; no admin, sem sessão, 401", async () => {
    for (const role of ["app", "www"] as const) {
      const c = await client(role);
      const r = await c.get("/api/admin/dashboard");
      expect(r.status(), role).toBe(404);
    }
    expect((await (await client("admin")).get("/api/admin/dashboard")).status()).toBe(401);
  });

  test("API do app e de login não existem no www; o admin só tem as dele", async () => {
    const www = await client("www");
    expect((await www.get("/api/me")).status()).toBe(404);
    expect((await www.post("/api/auth/login", { data: ADMIN, headers: { origin: ORIGIN("www") } })).status()).toBe(404);
    expect((await www.get("/api/events")).status()).toBe(404);
    expect((await www.get("/api/public/pulse")).status()).toBe(200);
    const admin = await client("admin");
    expect((await admin.get("/api/rides")).status()).toBe(404);
    expect((await admin.post("/api/auth/register", { data: {}, headers: { origin: ORIGIN("admin") } })).status()).toBe(404);
  });

  test("páginas no host errado: /admin 404; páginas do app redirecionam para o host da configuração, não o do pedido", async () => {
    expect((await (await client("www")).get("/admin")).status()).toBe(404);
    expect((await (await client("app")).get("/admin/usuarios")).status()).toBe(404);
    // Um x-forwarded-host forjado não muda o destino (e nem vale, sem TRUST_PROXY).
    const www = await client("www", { "x-forwarded-host": "evil.test" });
    const r = await www.get("/entrar?perfil=motorista");
    expect(r.status()).toBe(307);
    expect(r.headers()["location"]).toBe(`${ORIGIN("app")}/entrar?perfil=motorista`);
    const back = await (await client("app")).get("/clube");
    expect(back.status()).toBe(307);
    expect(back.headers()["location"]).toBe(`${ORIGIN("www")}/clube`);
    const root = await (await client("app")).get("/");
    expect(root.headers()["location"]).toBe(`${ORIGIN("app")}/entrar`);
  });

  test("robots: só o www se oferece; app e painel pedem para não ser indexados", async () => {
    expect(await (await (await client("www")).get("/robots.txt")).text()).toContain(`${ORIGIN("www")}/sitemap.xml`);
    for (const role of ["app", "admin"] as const) {
      const c = await client(role);
      const r = await c.get("/robots.txt");
      expect(await r.text()).toMatch(/Disallow: \/\s*$/m);
      expect(r.headers()["x-robots-tag"]).toContain("noindex");
      expect((await (await client(role)).get("/sitemap.xml")).status()).toBe(200);
    }
    expect((await (await client("www")).get("/")).headers()["x-robots-tag"]).toBeUndefined();
  });

  test("CSP: o painel não leva wasm-unsafe-eval; o app e o site seguem como antes", async () => {
    const csp = async (role: Role, p: string) => (await (await client(role)).get(p)).headers()["content-security-policy"] ?? "";
    expect(await csp("admin", "/admin")).not.toContain("wasm-unsafe-eval");
    expect(await csp("admin", "/admin")).toContain("'nonce-");
    expect(await csp("app", "/entrar")).toContain("wasm-unsafe-eval");
    expect(await csp("www", "/")).toContain("wasm-unsafe-eval");
  });
});

test.describe("três endereços: sessão e cookies", () => {
  test("login: o app recusa a equipe; o painel recusa quem não é equipe, com a mensagem genérica", async () => {
    const app = await client("app", { origin: ORIGIN("app") });
    const staffOnApp = await app.post("/api/auth/login", { data: ADMIN });
    expect(staffOnApp.status()).toBe(403);
    expect(setCookies(staffOnApp)).toEqual([]);

    const p = await registerPassenger();
    const admin = await client("admin", { origin: ORIGIN("admin") });
    const passengerOnAdmin = await admin.post("/api/auth/login", { data: { identifier: p.email, password: "senha-de-teste" } });
    expect(passengerOnAdmin.status()).toBe(401);
    expect((await passengerOnAdmin.json()).error).toBe("E-mail, telefone ou senha incorretos.");
    expect(setCookies(passengerOnAdmin)).toEqual([]);
    // Mesma resposta de uma senha errada de verdade.
    const wrong = await admin.post("/api/auth/login", { data: { identifier: ADMIN.identifier, password: "errada-errada" } });
    expect((await wrong.json()).error).toBe("E-mail, telefone ou senha incorretos.");
  });

  test("o cookie do painel é __Host-: Secure, Path=/, HttpOnly e sem Domain; o do app também", async () => {
    const { r } = await loginAdmin();
    const sc = setCookies(r).find((c) => c.startsWith("__Host-orbi_admin="))!;
    expect(sc).toMatch(/;\s*Path=\/(;|$)/i);
    expect(sc).toMatch(/;\s*Secure/i);
    expect(sc).toMatch(/;\s*HttpOnly/i);
    expect(sc).not.toMatch(/Domain=/i);
    const pass = await registerPassenger();
    const sp = setCookies(pass.r).find((c) => c.startsWith("__Host-orbi_session="))!;
    expect(sp).toMatch(/;\s*Secure/i);
    expect(sp).not.toMatch(/Domain=/i);
    expect(setCookies(pass.r).some((c) => c.startsWith("prumo_session="))).toBe(false);
  });

  test("o cookie do app não abre o painel (nem o do painel abre o app)", async () => {
    const pass = await registerPassenger();
    const adm = await loginAdmin();
    // O cookie do app funciona no app.
    const app = await client("app", { cookie: `__Host-orbi_session=${pass.token}` });
    expect((await whoAmI(app))?.role).toBe("passenger");
    // O mesmo token, apresentado ao painel por qualquer nome, não vale.
    for (const name of ["__Host-orbi_admin", "__Host-orbi_session", "prumo_session"]) {
      const c = await client("admin", { cookie: `${name}=${pass.token}` });
      expect((await c.get("/api/admin/dashboard")).status(), name).toBe(401);
      expect((await c.get("/api/events")).status(), name).toBe(401);
    }
    // O token do painel funciona no painel...
    const admin = await client("admin", { cookie: `__Host-orbi_admin=${adm.token}` });
    expect((await admin.get("/api/admin/dashboard")).status()).toBe(200);
    // ...e não no app, por nenhum dos nomes.
    for (const name of ["__Host-orbi_session", "__Host-orbi_admin"]) {
      const c = await client("app", { cookie: `${name}=${adm.token}` });
      expect(await whoAmI(c), name).toBeNull();
    }
  });

  test("cookie plantado com Domain (nome comum, valido o token) é ignorado", async () => {
    const pass = await registerPassenger();
    const adm = await loginAdmin();
    // Um subdomínio vizinho só consegue plantar cookies com nomes sem o prefixo __Host-. O servidor lê apenas os __Host-.
    for (const name of ["orbi_session", "prumo_session", "session", "orbi_admin"]) {
      const asApp = await client("app", { cookie: `${name}=${pass.token}` });
      expect(await whoAmI(asApp), `app ${name}`).toBeNull();
      const asAdmin = await client("admin", { cookie: `${name}=${adm.token}` });
      expect((await asAdmin.get("/api/admin/dashboard")).status(), `admin ${name}`).toBe(401);
    }
  });

  test("o painel só vale com a conta da equipe: token do app apresentado como __Host-orbi_admin cai na conferência de escopo", async () => {
    // Troca de escopo no mesmo nome: o claim scp do token é conferido, não só o nome do cookie.
    const pass = await registerPassenger();
    const c = await client("admin", { cookie: `__Host-orbi_admin=${pass.token}` });
    expect((await c.get("/api/events")).status()).toBe(401);
  });
});

test.describe("três endereços: anti-CSRF (Origin)", () => {
  test("POST no painel com Origin do www ou do app dá 403; com o do próprio painel passa", async () => {
    for (const from of ["www", "app"] as const) {
      const c = await client("admin", { origin: ORIGIN(from) });
      const r = await c.post("/api/auth/login", { data: ADMIN });
      expect(r.status(), from).toBe(403);
      expect(setCookies(r)).toEqual([]);
    }
    const evil = await client("admin", { origin: "https://evil.test" });
    expect((await evil.post("/api/auth/login", { data: ADMIN })).status()).toBe(403);
    // x-forwarded-host forjado não legitima o Origin (sem TRUST_PROXY).
    const spoof = await client("admin", { origin: "https://evil.test", "x-forwarded-host": "evil.test" });
    expect((await spoof.post("/api/auth/login", { data: ADMIN })).status()).toBe(403);
    const ok = await client("admin", { origin: ORIGIN("admin") });
    expect((await ok.post("/api/auth/login", { data: ADMIN })).status()).toBe(200);
  });

  test("POST no app com Origin do www também dá 403", async () => {
    const c = await client("app", { origin: ORIGIN("www") });
    expect((await c.post("/api/auth/login", { data: { identifier: "x@y.test", password: "qualquer" } })).status()).toBe(403);
  });
});

test.describe("três endereços: tela do painel (navegador)", () => {
  test("login próprio, painel, e saída volta ao login", async ({ page }) => {
    const base = ORIGIN("admin");
    await page.goto(`${base}/admin`);
    await expect(page.getByRole("heading", { name: "Painel da equipe" })).toBeVisible();
    // Sem sessão: nada do painel na tela.
    await expect(page.getByRole("navigation", { name: "Administração" })).toHaveCount(0);
    await page.getByLabel("E-mail").fill(ADMIN.identifier);
    await page.getByLabel("Senha").fill(ADMIN.password);
    await page.getByRole("button", { name: "Entrar" }).click();
    await expect(page.getByRole("navigation", { name: "Administração" }).first()).toBeAttached({ timeout: 30_000 });
    // O cookie do navegador: __Host- do painel; nenhum com o nome antigo.
    const names = (await page.context().cookies(base)).map((c) => c.name);
    expect(names).toContain("__Host-orbi_admin");
    expect(names).not.toContain("prumo_session");
    // O painel aberto no host do app não existe.
    expect((await page.goto(`${ORIGIN("app")}/admin`))?.status()).toBe(404);
    await page.goto(`${base}/admin`);
    await page.getByRole("button", { name: "Sair" }).click();
    await expect(page.getByRole("heading", { name: "Painel da equipe" })).toBeVisible({ timeout: 30_000 });
  });

  test("o site (www) não lê sessão: abre como visitante e os botões apontam para o app", async ({ page }) => {
    await page.goto(`${ORIGIN("www")}/`);
    const enter = page.getByRole("link", { name: "Entrar", exact: true }).first();
    await expect(enter).toHaveAttribute("href", `${ORIGIN("app")}/entrar?etapa=login`);
  });
});
