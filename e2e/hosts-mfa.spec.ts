import fs from "node:fs";
import { validCpf } from "./documents";
import path from "node:path";
import { createHmac } from "node:crypto";
import { expect, request, test, type APIResponse } from "@playwright/test";

/**
 * Três endereços com a segunda etapa da equipe OBRIGATÓRIA (servidor da porta 3104, scripts/e2e-hosts-server.ts 3104 mfa).
 * A equipe ativa e usa a verificação em duas etapas pelo próprio painel, no host admin (/api/account/mfa-*), sem passar pelo app.
 */
const PORT = 3104;
const HOST = { admin: `admin.localhost:${PORT}`, app: `app.localhost:${PORT}`, www: `www.localhost:${PORT}` };
const ADMIN = { identifier: "admin@e2e.prumo.test", password: "e2e-admin-password" };
let seq = 0;

const client = (role: keyof typeof HOST, extra: Record<string, string> = {}) =>
  request.newContext({ baseURL: `http://localhost:${PORT}`, maxRedirects: 0, extraHTTPHeaders: { host: HOST[role], origin: `http://${HOST[role]}`, "x-forwarded-for": `10.8.0.${++seq}`, ...extra } });
const cookie = (r: APIResponse, name: string) => r.headersArray().filter((h) => h.name.toLowerCase() === "set-cookie").map((h) => h.value.split(";")[0]).find((c) => c.startsWith(`${name}=`))?.slice(name.length + 1);

const B32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
function totp(secret: string, step: number) {
  let bits = 0, value = 0; const key: number[] = [];
  for (const ch of secret.toUpperCase()) { value = (value << 5) | B32.indexOf(ch); bits += 5; if (bits >= 8) { key.push((value >>> (bits - 8)) & 255); bits -= 8; } }
  const msg = Buffer.alloc(8); msg.writeBigUInt64BE(BigInt(step));
  const h = createHmac("sha1", Buffer.from(key)).update(msg).digest();
  const o = h[h.length - 1] & 15;
  return String((((h[o] & 0x7f) << 24) | (h[o + 1] << 16) | (h[o + 2] << 8) | h[o + 3]) % 1_000_000).padStart(6, "0");
}

test.describe.configure({ mode: "serial" });

test("a equipe ativa a segunda etapa pelo painel e entra com ela, tudo no host admin", async () => {
  const anon = await client("admin");
  const login = await anon.post("/api/auth/login", { data: ADMIN });
  expect(login.status(), await login.text()).toBe(200);
  const token = cookie(login, "__Host-orbi_admin")!;
  const adm = await client("admin", { cookie: `__Host-orbi_admin=${token}` });

  // Sem a segunda etapa, o painel (API) fica fechado e avisa o que fazer.
  const blocked = await adm.get("/api/admin/dashboard");
  expect(blocked.status()).toBe(403);
  expect((await blocked.json()).code).toBe("mfa_setup");

  // Estado, início e confirmação da ativação: tudo em /api/account no host do painel.
  expect((await (await adm.get("/api/account/mfa")).json()).enabled).toBe(false);
  const start = await adm.post("/api/account/mfa-start", { data: {} });
  expect(start.status(), await start.text()).toBe(200);
  const { secret } = await start.json();
  const step = Math.floor(Date.now() / 30_000);
  const enable = await adm.post("/api/account/mfa-enable", { data: { code: totp(secret, step) } });
  expect(enable.status(), await enable.text()).toBe(200);
  const recovery = (await enable.json()).recoveryCodes as string[];
  expect(recovery.length).toBeGreaterThan(0);

  expect((await adm.get("/api/admin/dashboard")).status()).toBe(200);
  expect((await (await adm.get("/api/account/mfa")).json()).enabled).toBe(true);
  expect((await adm.get("/api/account/sessions")).status()).toBe(200);

  // Novo login: agora pede o código (o do passo seguinte, porque o atual já foi usado) e só então abre o painel.
  const again = await (await client("admin")).post("/api/auth/login", { data: ADMIN });
  expect((await again.json()).mfaRequired).toBe(true);
  const pending = await client("admin", { cookie: `__Host-orbi_admin=${cookie(again, "__Host-orbi_admin")}` });
  expect((await pending.get("/api/admin/dashboard")).status()).toBe(401);
  // Entra com um código de recuperação: o passo seguinte do autenticador fica para a reautenticação abaixo (cada passo vale uma vez).
  const mfa = await pending.post("/api/auth/mfa", { data: { code: recovery[0] } });
  expect(mfa.status(), await mfa.text()).toBe(200);
  expect((await pending.get("/api/admin/dashboard")).status()).toBe(200);

  // Reautenticação (step-up) com o código do aplicativo: ação sensível pede, e passa depois.
  const settings = { withdrawal: { minCents: 2000 } };
  const needs = await pending.post("/api/admin/settings", { data: settings });
  expect(needs.status()).toBe(403);
  expect((await needs.json()).code).toBe("step_up");
  expect((await (await pending.get("/api/account/mfa")).json()).stepUp).toBe("totp");
  expect((await pending.post("/api/account/step-up", { data: { code: "000000" } })).status()).toBe(400);
  const up = await pending.post("/api/account/step-up", { data: { code: totp(secret, step + 1) } });
  expect(up.status(), await up.text()).toBe(200);
  expect((await pending.post("/api/admin/settings", { data: settings })).status()).toBe(200);

  // Convite: o link sai no endereço do painel, a tela só existe nele, e a pessoa ativa a segunda etapa pelo convite.
  const email = `convidada${Date.now()}@e2e.prumo.test`;
  const invite = await pending.post("/api/admin/staff", { data: { name: "Pessoa Convidada", email, role: "gestor" } });
  expect(invite.status(), await invite.text()).toBe(200);
  const dir = path.join(process.cwd(), ".data-e2e-hosts-mfa", "outbox");
  const mail = fs.readFileSync(path.join(dir, fs.readdirSync(dir).filter((f) => f.includes(email)).sort().at(-1)!), "utf8");
  const link = mail.match(/http:\/\/admin\.localhost:3104\/convite\/([A-Za-z0-9_-]{20,})/);
  expect(link, mail).not.toBeNull();
  const inviteToken = link![1];
  expect((await (await client("www")).get(`/convite/${inviteToken}`)).status()).toBe(404);
  expect((await (await client("app")).get(`/convite/${inviteToken}`)).status()).toBe(404);
  expect((await (await client("app")).post("/api/auth/invite-info", { data: { token: inviteToken } })).status()).toBe(404);
  const invitee = await client("admin");
  expect((await invitee.get(`/convite/${inviteToken}`)).status()).toBe(200);
  expect((await invitee.post("/api/auth/invite-info", { data: { token: inviteToken } })).status()).toBe(200);
  const started = await invitee.post("/api/auth/invite-start", { data: { token: inviteToken, password: "senha-do-convite-12" } });
  expect(started.status(), await started.text()).toBe(200);
  const inviteeSecret = (await started.json()).secret as string;
  const done = await invitee.post("/api/auth/invite-finish", { data: { token: inviteToken, code: totp(inviteeSecret, step) } });
  expect(done.status(), await done.text()).toBe(200);
  const inviteeCookie = cookie(done, "__Host-orbi_admin")!;
  const inSession = await client("admin", { cookie: `__Host-orbi_admin=${inviteeCookie}` });
  expect((await inSession.get("/api/admin/dashboard")).status()).toBe(200);
});

test("lista de IPs do painel: o host do painel inteiro some para quem está fora (404); app e www seguem", async () => {
  const outside = (role: keyof typeof HOST) => client(role, { "x-forwarded-for": "198.51.100.44" });
  const admin = await outside("admin");
  for (const p of ["/admin", "/api/admin/dashboard", "/api/auth/login", "/convite/abc", "/entrar"]) expect((await admin.get(p)).status(), p).toBe(404);
  expect((await admin.post("/api/auth/login", { data: ADMIN })).status()).toBe(404);
  expect((await (await outside("app")).get("/entrar")).status()).toBe(200);
  expect((await (await outside("www")).get("/")).status()).toBe(200);
  // De dentro da lista, o painel responde (a tela de entrada do painel).
  expect([200, 307]).toContain((await (await client("admin")).get("/admin")).status());
});

test("o resto de /api/account continua só no app; o www não tem nada disso", async () => {
  const login = await (await client("admin")).post("/api/auth/login", { data: ADMIN });
  expect([200, 401]).toContain(login.status());
  const adm = await client("admin", { cookie: `__Host-orbi_admin=${cookie(login, "__Host-orbi_admin") ?? ""}` });
  for (const p of ["/api/account/become-driver", "/api/account/tickets", "/api/account/notifications"]) expect((await adm.get(p)).status(), p).toBe(404);
  expect((await (await client("www")).get("/api/account/mfa")).status()).toBe(404);
});

test("robôs (regra inteira, sem atalho de teste): carimbo rápido, forjado ou ausente é recusado em silêncio; depois de 3 s vale", async () => {
  const app = await client("app");
  const n = Date.now();
  const cpf = validCpf();
  const email = `carimbo${n}@e2e.prumo.test`;
  const data = (extra: object) => ({ name: "Pessoa Carimbo Teste", email, password: "senha-de-teste-9", cpf, acceptPrivacy: true, ...extra });
  const exists = async () => (await (await (await client("app")).post("/api/auth/lookup", { data: { identifier: email } })).json()).exists as boolean;

  const stamp = (await (await app.get("/api/public/form-stamp")).json()).stamp as string;
  expect(stamp).toMatch(/^\d{13}\.[0-9a-f]{64}$/);
  // Rápido demais (acabou de abrir a página), sem carimbo e com assinatura trocada: "deu certo", mas nada é criado.
  for (const extra of [{ stamp }, {}, { stamp: `${Date.now() - 600_000}.${stamp.split(".")[1]}` }, { stamp: `${n}.${"0".repeat(64)}` }]) {
    const r = await (await client("app")).post("/api/auth/register", { data: data(extra) });
    expect(r.status()).toBe(200);
    expect(await r.json()).toEqual({ ok: true });
  }
  expect(await exists()).toBe(false);
  // Passados 3 s, o carimbo verdadeiro vale e a conta é criada.
  await new Promise((r) => setTimeout(r, 3200));
  const real = await (await client("app")).post("/api/auth/register", { data: data({ stamp }) });
  expect(real.status(), await real.text()).toBe(200);
  expect((await real.json()).role).toBe("passenger");
});
