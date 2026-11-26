import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { expect, request, test, type APIRequestContext } from "@playwright/test";
import { adminApi, apiClient, BASE, createStaffApi, lastCode, registerApi, stepUpApi, unique } from "./helpers";
import { totpAt, totpStep } from "../src/backend/security";

/**
 * Etapa 1 do endurecimento de acesso: bloqueio de conta, reautenticação (step-up) do painel, convite da equipe,
 * lista de IPs do painel, limite de sessões, aviso de acesso novo e limite do SSE.
 * O atraso progressivo do login errado fica desligado aqui (PRUMO_LOGIN_DELAY_SCALE=0 em scripts/e2e-server.ts);
 * os tempos em si (2^(n-3) s, 15 min, 1 h, 24 h) são conferidos nos testes unitários.
 */
test.describe.configure({ mode: "serial" });

const OUTBOX = path.join(process.cwd(), ".data-e2e", "outbox");
const mailsFor = (email: string) => (fs.existsSync(OUTBOX) ? fs.readdirSync(OUTBOX).filter((f) => f.includes(email)).sort().map((f) => fs.readFileSync(path.join(OUTBOX, f), "utf8")) : []);

type AuditRow = { id: string; actorId: string | null; action: string; entityId: string | null; meta: Record<string, unknown> | null; ip: string | null; ua: string | null };
const auditRows = async (admin: APIRequestContext) => (await (await admin.get("/api/admin/r/audit")).json()).rows as AuditRow[];

test("conta bloqueada na 10ª senha errada: 401 genérico até com a senha certa; Esqueci a senha desbloqueia", async () => {
  const { c: owner, userId } = await registerApi("Passageiro");
  const me = (await (await owner.get("/api/me")).json()).user;
  const admin = await adminApi();
  let last = 0;
  for (let i = 1; i <= 10; i++) {
    const r = await (await apiClient()).post("/api/auth/login", { data: { identifier: me.email, password: `errada-${i}` } });
    last = r.status();
    expect(last, `tentativa ${i}`).toBe(401);
    expect((await r.json()).error).toBe("E-mail, telefone ou senha incorretos.");
  }
  // Bloqueada: a senha certa também recebe o mesmo 401 genérico.
  const rightButLocked = await (await apiClient()).post("/api/auth/login", { data: { identifier: me.email, password: "senha-de-teste" } });
  expect(rightButLocked.status()).toBe(401);
  expect((await rightButLocked.json()).error).toBe("E-mail, telefone ou senha incorretos.");

  const rows = await auditRows(admin);
  expect(rows.some((r) => r.action === "login.locked" && r.entityId === userId)).toBe(true);
  expect(rows.filter((r) => r.action === "login.failed" && r.entityId === userId).length).toBeGreaterThanOrEqual(10);
  // E-mail ao dono, um só.
  expect(mailsFor(me.email).filter((m) => m.includes("bloqueada por segurança"))).toHaveLength(1);

  // "Esqueci a senha" funciona com a conta bloqueada e a desbloqueia.
  const c = await apiClient();
  expect((await c.post("/api/auth/reset-request", { data: { identifier: me.email } })).ok()).toBeTruthy();
  const reset = await c.post("/api/auth/reset-confirm", { data: { identifier: me.email, code: lastCode(me.email), password: "senha-nova-depois-do-bloqueio" } });
  expect(reset.ok(), await reset.text()).toBeTruthy();
  expect((await (await apiClient()).post("/api/auth/login", { data: { identifier: me.email, password: "senha-nova-depois-do-bloqueio" } })).ok()).toBeTruthy();
  // E o contador voltou a zero: uma senha errada agora é só uma falha.
  expect((await (await apiClient()).post("/api/auth/login", { data: { identifier: me.email, password: "errada-de-novo" } })).status()).toBe(401);
});

test("conta que não existe: mesma resposta, mesmo limite, e nenhuma linha na auditoria", async () => {
  const admin = await adminApi();
  const ghost = `fantasma${unique()}@e2e.prumo.test`;
  const before = (await auditRows(admin)).filter((r) => r.action === "login.failed" && r.actorId === null).length;
  let last = 0;
  for (let i = 0; i < 13; i++) {
    const r = await (await apiClient()).post("/api/auth/login", { data: { identifier: ghost, password: `errada-${i}` } });
    last = r.status();
    if (i < 12) expect((await r.json()).error).toBe("E-mail, telefone ou senha incorretos.");
  }
  expect(last).toBe(429);
  expect((await auditRows(admin)).filter((r) => r.action === "login.failed" && r.actorId === null).length).toBe(before);
});

test("segunda etapa: 6 erros por janela; o 7º pedido já é 429", async () => {
  const admin = await adminApi();
  const staff = await createStaffApi(admin, "atendente");
  const second = await apiClient();
  expect((await (await second.post("/api/auth/login", { data: { identifier: staff.email, password: staff.password } })).json()).mfaRequired).toBe(true);
  for (let i = 0; i < 6; i++) expect((await second.post("/api/auth/mfa", { data: { code: "000000" } })).status()).toBe(400);
  expect((await second.post("/api/auth/mfa", { data: { code: "000000" } })).status()).toBe(429);
  // Nem o código certo passa dentro da janela estourada.
  expect((await second.post("/api/auth/mfa", { data: { code: staff.recoveryCodes[0] } })).status()).toBe(429);
  const rows = await auditRows(admin);
  expect(rows.filter((r) => r.action === "staff.mfa_failed" && r.entityId === staff.userId).length).toBe(6);
});

test("reautenticação (step-up): ações sensíveis pedem o código; aceito, a ação passa e a auditoria guarda antes e depois", async () => {
  const admin = await adminApi();
  const a2 = await createStaffApi(admin, "admin");
  const stepUpNeeded = async (r: { status(): number; json(): Promise<{ code?: string }> }) => { expect(r.status()).toBe(403); expect((await r.json()).code).toBe("step_up"); };

  const passenger = await registerApi("Passageiro");
  const tariffs = (await (await a2.c.get("/api/admin/r/tariffs")).json()).rows as { id: string; commissionBps: number }[];
  const t0 = tariffs[0];
  // Sem reautenticação: tudo da lista volta 403 step_up.
  await stepUpNeeded(await a2.c.post("/api/admin/settings", { data: { withdrawal: { minCents: 2500 } } }));
  await stepUpNeeded(await a2.c.post("/api/admin/staff", { data: { name: "Pessoa Teste", email: `x${unique()}@e2e.prumo.test`, role: "atendente" } }));
  await stepUpNeeded(await a2.c.patch(`/api/admin/r/tariffs/${t0.id}`, { data: { commissionBps: 1100 } }));
  await stepUpNeeded(await a2.c.post("/api/admin/r/coupons", { data: { code: `X${unique()}`.toUpperCase(), kind: "fixed", value: 100, active: true } }));
  await stepUpNeeded(await a2.c.post("/api/admin/r/regions", { data: { name: `Regiao ${unique()}` } }));
  await stepUpNeeded(await a2.c.post(`/api/admin/users/${passenger.userId}`, { data: { status: "suspended" } }));
  await stepUpNeeded(await a2.c.post(`/api/admin/withdrawals/${randomUUID()}`, { data: { status: "rejected" } }));
  await stepUpNeeded(await a2.c.post(`/api/admin/settlements/${randomUUID()}`, { data: { status: "rejected", reason: "teste" } }));
  await stepUpNeeded(await a2.c.post("/api/admin/cpf-release", { data: { cpf: "52998224725", note: "teste" } }));
  await stepUpNeeded(await a2.c.post("/api/admin/cpf-block-release", { data: { cpf: "52998224725", note: "teste de bloqueio" } }));
  // O que não é sensível continua livre.
  expect((await a2.c.get("/api/admin/dashboard")).status()).toBe(200);
  expect((await a2.c.post(`/api/admin/tickets/${randomUUID()}`, { data: { status: "closed" } })).status()).toBe(404);
  // Reativar um passageiro não pede (suspender e mexer na equipe pedem).
  expect((await a2.c.post(`/api/admin/users/${passenger.userId}`, { data: { status: "active" } })).status()).toBe(200);

  // Quem tem o autenticador ativo reautentica com o código (o passo seguinte, porque o atual já entrou no convite).
  expect((await (await a2.c.get("/api/account/mfa")).json()).stepUp).toBe("totp");
  const wrong = await a2.c.post("/api/account/step-up", { data: { code: "000000" } });
  expect(wrong.status()).toBe(400);
  const step = totpStep() + 1;
  const ok = await a2.c.post("/api/account/step-up", { data: { code: totpAt(a2.secret, step) } });
  expect(ok.status(), await ok.text()).toBe(200);
  // O mesmo código não vale duas vezes.
  expect((await a2.c.post("/api/account/step-up", { data: { code: totpAt(a2.secret, step) } })).status()).toBe(400);

  // Agora passa, e a auditoria guarda o antes e o depois.
  const before = (await (await a2.c.get("/api/admin/settings")).json()).withdrawal.minCents as number;
  expect((await a2.c.post("/api/admin/settings", { data: { withdrawal: { minCents: 2500 } } })).status()).toBe(200);
  expect((await a2.c.post("/api/admin/settings", { data: { withdrawal: { minCents: before } } })).status()).toBe(200);
  const patched = await a2.c.patch(`/api/admin/r/tariffs/${t0.id}`, { data: { commissionBps: 1100 } });
  expect(patched.status(), await patched.text()).toBe(200);
  expect((await a2.c.patch(`/api/admin/r/tariffs/${t0.id}`, { data: { commissionBps: t0.commissionBps } })).status()).toBe(200);
  expect((await a2.c.post(`/api/admin/users/${passenger.userId}`, { data: { status: "suspended" } })).status()).toBe(200);
  expect((await a2.c.post(`/api/admin/users/${passenger.userId}`, { data: { status: "active" } })).status()).toBe(200);

  const rows = await auditRows(admin);
  const settingsRow = rows.find((r) => r.action === "settings.update" && (r.meta?.after as { withdrawal?: { minCents: number } } | undefined)?.withdrawal?.minCents === 2500)!;
  expect((settingsRow.meta!.before as { withdrawal: { minCents: number } }).withdrawal.minCents).toBe(before);
  const tariffRow = rows.find((r) => r.action === "tariffs.update" && r.entityId === t0.id && (r.meta?.after as { commissionBps?: number } | undefined)?.commissionBps === 1100)!;
  expect(tariffRow.meta!.before).toMatchObject({ commissionBps: t0.commissionBps });
  expect(rows.some((r) => r.action === "staff.step_up" && r.actorId === a2.userId)).toBe(true);
  expect(rows.some((r) => r.action === "staff.step_up_failed" && r.actorId === a2.userId)).toBe(true);
});

test("sem segunda etapa exigida (só teste), a reautenticação é pela senha", async () => {
  const fresh = await apiClient();
  expect((await fresh.post("/api/auth/login", { data: { identifier: "admin@e2e.prumo.test", password: "e2e-admin-password" } })).ok()).toBeTruthy();
  const blocked = await fresh.post("/api/admin/settings", { data: { withdrawal: { minCents: 2000 } } });
  expect(blocked.status()).toBe(403);
  expect((await blocked.json()).code).toBe("step_up");
  expect((await fresh.get("/api/account/mfa").then((r) => r.json())).stepUp).toBe("password");
  expect((await fresh.post("/api/account/step-up", { data: { password: "senha-errada" } })).status()).toBe(400);
  await stepUpApi(fresh);
  expect((await fresh.post("/api/admin/settings", { data: { withdrawal: { minCents: 2000 } } })).status()).toBe(200);
  // Passageiro não reautentica nada.
  expect((await (await registerApi("Passageiro")).c.post("/api/account/step-up", { data: { password: "senha-de-teste" } })).status()).toBe(403);
});

test("convite da equipe: uso único, sem escolher a senha, aviso aos administradores e entrada pela segunda etapa", async () => {
  const admin = await adminApi();
  const staff = await createStaffApi(admin, "gestor", "outra-senha-da-equipe-9");
  // O link foi por e-mail, com token de verdade (e o administrador recebeu o aviso de conta nova).
  expect(mailsFor(staff.email).some((m) => m.includes("/convite/"))).toBe(true);
  expect(mailsFor("admin@e2e.prumo.test").some((m) => m.includes("Nova conta da equipe criada") && m.includes(staff.email))).toBe(true);
  // O token não repete: o convite foi usado.
  const again = await (await apiClient()).post("/api/auth/invite-start", { data: { token: staff.token, password: "tentando-de-novo-123" } });
  expect(again.status()).toBe(410);
  expect((await (await apiClient()).post("/api/auth/invite-info", { data: { token: "x".repeat(43) } })).status()).toBe(410);
  // A ativação deixou a pessoa dentro do painel, e com a segunda etapa ligada.
  expect((await staff.c.get("/api/admin/dashboard")).status()).toBe(200);
  expect((await (await staff.c.get("/api/account/mfa")).json()).enabled).toBe(true);
  // Entrar de novo pede senha e depois o código (aqui, um código de recuperação).
  const again2 = await apiClient();
  expect((await (await again2.post("/api/auth/login", { data: { identifier: staff.email, password: staff.password } })).json()).mfaRequired).toBe(true);
  expect((await again2.get("/api/admin/dashboard")).status()).toBe(401);
  expect((await again2.post("/api/auth/mfa", { data: { code: staff.recoveryCodes[0] } })).ok()).toBeTruthy();
  expect((await again2.get("/api/admin/dashboard")).status()).toBe(200);
  // Equipe: todo login gera auditoria staff.login e e-mail de acesso.
  const rows = await auditRows(admin);
  expect(rows.some((r) => r.action === "staff.login" && r.entityId === staff.userId)).toBe(true);
  expect(rows.some((r) => r.action === "staff.invite_accepted" && r.entityId === staff.userId)).toBe(true);
  await expect.poll(() => mailsFor(staff.email).some((m) => m.includes("Acesso ao painel da Orbi"))).toBe(true);
  // O criador não escolhe a senha: o corpo antigo (com password) não cria conta com ela.
  const email = `semsenha${unique()}@e2e.prumo.test`;
  await stepUpApi(admin);
  expect((await admin.post("/api/admin/staff", { data: { name: "Pessoa Sem Senha", email, role: "atendente", password: "senha-escolhida-pelo-admin" } })).ok()).toBeTruthy();
  expect((await (await apiClient()).post("/api/auth/login", { data: { identifier: email, password: "senha-escolhida-pelo-admin" } })).status()).toBe(401);
});

test("sessões: a equipe tem no máximo 3 abertas (as mais antigas caem)", async () => {
  const admin = await adminApi();
  const staff = await createStaffApi(admin, "atendente");
  const logins: APIRequestContext[] = [];
  for (let i = 0; i < 3; i++) {
    const c = await apiClient();
    expect((await c.post("/api/auth/login", { data: { identifier: staff.email, password: staff.password } })).ok()).toBeTruthy();
    expect((await c.post("/api/auth/mfa", { data: { code: staff.recoveryCodes[i + 1] } })).ok()).toBeTruthy();
    logins.push(c);
    // a cada nova sessão, a lista nunca passa de 3
    expect(((await (await c.get("/api/account/sessions")).json()).sessions as unknown[]).length).toBeLessThanOrEqual(3);
  }
  // A do convite (a mais antiga) caiu; as 3 novas seguem.
  expect((await staff.c.get("/api/admin/dashboard")).status()).toBe(401);
  for (const c of logins) expect((await c.get("/api/admin/dashboard")).status()).toBe(200);
});

test("aviso de acesso novo: só com aparelho e rede novos", async () => {
  const { c: first } = await registerApi("Passageiro");
  const me = (await (await first.get("/api/me")).json()).user;
  const login = async (ip: string, ua: string) => {
    const c = await request.newContext({ baseURL: BASE, extraHTTPHeaders: { "x-forwarded-for": ip, "user-agent": ua } });
    expect((await c.post("/api/auth/login", { data: { identifier: me.email, password: "senha-de-teste" } })).ok()).toBeTruthy();
  };
  const novo = () => mailsFor(me.email).filter((m) => m.includes("Novo acesso à sua conta"));
  // 1) aparelho e rede que a conta nunca viu: avisa.
  await login("10.50.1.1", "NavegadorA/1.0");
  await expect.poll(() => novo().length).toBe(1);
  // 2) mesmo aparelho, rede diferente: não avisa.
  await login("10.50.2.2", "NavegadorA/1.0");
  // 3) aparelho diferente, mesma rede de antes: não avisa.
  await login("10.50.1.9", "NavegadorB/1.0");
  // 4) aparelho e rede novos de novo: avisa.
  await login("10.51.3.3", "Mozilla/5.0 (iPhone; CPU iPhone OS 17) AppleWebKit Safari/604.1");
  await expect.poll(() => novo().length).toBe(2);
  await new Promise((r) => setTimeout(r, 500));
  expect(novo()).toHaveLength(2);
  expect(novo().some((m) => m.includes("10.50.1.0/24"))).toBe(true);
  expect(novo().some((m) => m.includes("10.51.3.0/24"))).toBe(true);
  // O IP aparece mascarado, nunca inteiro.
  expect(novo().some((m) => m.includes("10.51.3.3") || m.includes("10.50.1.1"))).toBe(false);
});

test("endereços fora de ADMIN_ALLOWED_IPS não enxergam o painel; a equipe de fora recebe o 401 de senha errada", async () => {
  const admin = await adminApi();
  const staff = await createStaffApi(admin, "atendente");
  const outside = await request.newContext({ baseURL: BASE, extraHTTPHeaders: { "x-forwarded-for": "192.0.2.77" } });
  // Painel, API do painel e convite não existem de fora; o resto do site segue aberto.
  expect((await outside.get("/admin")).status()).toBe(404);
  expect((await outside.get("/admin/motoristas")).status()).toBe(404);
  expect((await outside.get("/api/admin/dashboard")).status()).toBe(404);
  expect((await outside.get(`/convite/${staff.token}`)).status()).toBe(404);
  expect((await outside.get("/api/public/pulse")).status()).toBe(200);
  expect((await outside.get("/")).status()).toBe(200);
  // Login da equipe de fora: o mesmo 401 genérico, mesmo com a senha certa, e fica na auditoria.
  const wrong = await outside.post("/api/auth/login", { data: { identifier: staff.email, password: "errada-errada-1" } });
  const right = await outside.post("/api/auth/login", { data: { identifier: staff.email, password: staff.password } });
  expect(wrong.status()).toBe(401);
  expect(right.status()).toBe(401);
  expect(await right.json()).toEqual(await wrong.json());
  expect((await auditRows(admin)).some((r) => r.action === "staff.login_failed" && r.entityId === staff.userId && r.meta?.reason === "ip fora da lista")).toBe(true);
  // O passageiro de fora entra normalmente: a lista é só do painel.
  const p = await registerApi("Passageiro");
  const pOut = await request.newContext({ baseURL: BASE, extraHTTPHeaders: { "x-forwarded-for": "192.0.2.78" } });
  const me = (await (await p.c.get("/api/me")).json()).user;
  expect((await pOut.post("/api/auth/login", { data: { identifier: me.email, password: "senha-de-teste" } })).ok()).toBeTruthy();
  // E de dentro da lista a equipe entra.
  const inside = await apiClient();
  expect((await inside.post("/api/auth/login", { data: { identifier: staff.email, password: staff.password } })).ok()).toBeTruthy();
});

test("auditoria guarda IP mascarado em /24 e o navegador", async () => {
  const admin = await adminApi();
  const staff = await createStaffApi(admin, "atendente");
  const rows = await auditRows(admin);
  const row = rows.find((r) => r.action === "staff.invite_accepted" && r.entityId === staff.userId)!;
  expect(row.ip).toMatch(/^10\.0\.\d+\.0\/24$/);
  expect(row.ua).toBeTruthy();
});

test("SSE: no máximo 5 conexões por usuário", async () => {
  const { c } = await registerApi("Passageiro");
  const state = await c.storageState();
  const cookie = state.cookies.map((k) => `${k.name}=${k.value}`).join("; ");
  const controllers: AbortController[] = [];
  const open = async () => {
    const ctl = new AbortController();
    controllers.push(ctl);
    return fetch(`${BASE}/api/events`, { headers: { cookie, "x-forwarded-for": "10.77.0.1" }, signal: ctl.signal });
  };
  try {
    for (let i = 0; i < 5; i++) expect((await open()).status, `conexão ${i + 1}`).toBe(200);
    expect((await open()).status).toBe(429);
    // Fechando uma, abre outra.
    controllers[0].abort();
    await expect.poll(async () => (await open()).status, { timeout: 10_000 }).toBe(200);
  } finally {
    for (const ctl of controllers) ctl.abort();
  }
});

test("robots.txt não anuncia /admin", async () => {
  const body = await (await (await apiClient()).get("/robots.txt")).text();
  expect(body).not.toContain("/admin");
  expect(body).toContain("/api/");
});
