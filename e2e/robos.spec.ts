import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { adminApi, apiClient, approvedDriverApi, createStaffApi, registerApi, unique, validCpf } from "./helpers";

/**
 * Etapa 2 do endurecimento: robôs (campo-isca), descoberta de contas, permissão do gestor e CPF mascarado.
 * O servidor principal dos testes roda com PRUMO_FORM_GUARD_RELAX=true (sem carimbo nem tempo mínimo); o tempo mínimo
 * e o carimbo forjado são conferidos no servidor de três endereços com a regra inteira (e2e/hosts-mfa.spec.ts).
 */
test.describe.configure({ mode: "serial" });

const leadBody = (extra: object = {}) => ({ kind: "contato", name: "Pessoa Teste", email: `lead${unique()}@e2e.prumo.test`, message: "Oi", consent: true, ...extra });

test("campo-isca preenchido: cadastro, contato e moto-interest respondem ok e não gravam nada", async () => {
  const admin = await adminApi();
  const c = await apiClient();
  const email = `isca${unique()}@e2e.prumo.test`;
  const reg = await c.post("/api/auth/register", { data: { name: "Robo Teste Isca", email, password: "senha-de-teste", cpf: validCpf(), acceptPrivacy: true, website: "http://spam.example" } });
  expect(reg.status()).toBe(200);
  expect(await reg.json()).toEqual({ ok: true });
  expect((await (await apiClient()).post("/api/auth/login", { data: { identifier: email, password: "senha-de-teste" } })).status()).toBe(401);
  expect((await c.get("/api/me").then((r) => r.json())).user).toBeNull();

  const lead = leadBody({ website: "x" });
  expect(await (await c.post("/api/public/leads", { data: lead })).json()).toEqual({ ok: true });
  const motoEmail = `moto${unique()}@e2e.prumo.test`;
  expect(await (await c.post("/api/public/moto-interest", { data: { name: "Robo Moto", email: motoEmail, consent: true, website: "x" } })).json()).toEqual({ ok: true });
  const leads = (await (await admin.get("/api/admin/r/leads")).json()).rows as { email: string }[];
  expect(leads.some((l) => l.email === lead.email || l.email === motoEmail)).toBe(false);

  // Sem o campo-isca, o mesmo contato é gravado.
  const ok = leadBody();
  expect(await (await c.post("/api/public/leads", { data: ok })).json()).toEqual({ ok: true });
  const after = (await (await admin.get("/api/admin/r/leads")).json()).rows as { email: string }[];
  expect(after.some((l) => l.email === ok.email)).toBe(true);
});

test("a rota do carimbo responde e o carimbo tem a forma esperada", async () => {
  const r = await (await apiClient()).get("/api/public/form-stamp");
  expect(r.status()).toBe(200);
  expect((await r.json()).stamp).toMatch(/^\d{13}\.[0-9a-f]{64}$/);
});

test("lookup: cada e-mail ou celular só pode ser consultado 5 vezes por hora; depois responde que não existe", async () => {
  const { c } = await registerApi("Passageiro");
  const me = (await (await c.get("/api/me")).json()).user;
  const anon = await apiClient();
  for (let i = 0; i < 5; i++) expect(await (await anon.post("/api/auth/lookup", { data: { identifier: me.email } })).json(), `consulta ${i + 1}`).toEqual({ exists: true });
  expect(await (await anon.post("/api/auth/lookup", { data: { identifier: me.email } })).json()).toEqual({ exists: false });
  // Outro identificador não é afetado (o fluxo da entrada segue normal).
  const other = await registerApi("Passageiro");
  const otherEmail = (await (await other.c.get("/api/me")).json()).user.email;
  expect(await (await anon.post("/api/auth/lookup", { data: { identifier: otherEmail } })).json()).toEqual({ exists: true });
});

test("gestor só lê tarifas e planos; administrador altera", async () => {
  const admin = await adminApi();
  const gestor = await createStaffApi(admin, "gestor");
  for (const r of ["tariffs", "plans"]) {
    const list = await gestor.c.get(`/api/admin/r/${r}`);
    expect(list.status(), r).toBe(200);
    const rows = (await list.json()).rows as { id: string }[];
    expect((await gestor.c.patch(`/api/admin/r/${r}/${rows[0].id}`, { data: { active: true } })).status(), r).toBe(403);
  }
  // O resto do gestor segue: cupons, regiões, motoristas.
  expect((await gestor.c.get("/api/admin/r/coupons")).status()).toBe(200);
  expect((await gestor.c.get("/api/admin/drivers")).status()).toBe(200);
  // O administrador continua alterando (e a rota de equipe dele é a do step-up).
  const tariffs = (await (await admin.get("/api/admin/r/tariffs")).json()).rows as { id: string; commissionBps: number }[];
  expect((await admin.patch(`/api/admin/r/tariffs/${tariffs[0].id}`, { data: { commissionBps: tariffs[0].commissionBps } })).status()).toBe(200);
});

test("CPF e CNH mascarados para o atendente; revelar tem rota própria, auditoria e limite; admin e gestor veem inteiro", async () => {
  const admin = await adminApi();
  const driver = await approvedDriverApi(admin);
  const atendente = await createStaffApi(admin, "atendente");
  const gestor = await createStaffApi(admin, "gestor");
  const masked = (v: string | null) => v !== null && /^\*{3}\.\d{3}\.\d{3}-\*{2}$/.test(v);

  const row = ((await (await atendente.c.get("/api/admin/drivers")).json()).rows as { id: string; cpf: string; cnh: string; piiMasked: boolean }[]).find((d) => d.id === driver.userId)!;
  expect(row.piiMasked).toBe(true);
  expect(masked(row.cpf)).toBe(true);
  expect(row.cpf).toBe(`***.${driver.cpf.slice(3, 6)}.${driver.cpf.slice(6, 9)}-**`);
  expect(row.cnh).toMatch(/^\*+\d{3}$/);
  const userRow = ((await (await atendente.c.get("/api/admin/users")).json()).rows as { id: string; cpf: string | null; piiMasked: boolean }[]).find((u) => u.id === driver.userId)!;
  expect(masked(userRow.cpf)).toBe(true);
  expect(JSON.stringify(userRow)).not.toContain(driver.cpf);

  // Admin e gestor veem inteiro.
  for (const who of [admin, gestor.c]) {
    const full = ((await (await who.get("/api/admin/drivers")).json()).rows as { id: string; cpf: string; piiMasked: boolean }[]).find((d) => d.id === driver.userId)!;
    expect(full.cpf).toBe(driver.cpf);
    expect(full.piiMasked).toBe(false);
  }

  // Revelar: devolve inteiro, audita e respeita o limite.
  const revealed = await atendente.c.post(`/api/admin/pii/${driver.userId}`, { data: {} });
  expect(revealed.status(), await revealed.text()).toBe(200);
  expect((await revealed.json()).cpf).toBe(driver.cpf);
  const audit = ((await (await admin.get("/api/admin/r/audit")).json()).rows as { action: string; actorId: string | null; entityId: string | null }[]);
  expect(audit.some((a) => a.action === "user.cpf_view" && a.actorId === atendente.userId && a.entityId === driver.userId)).toBe(true);
  expect((await atendente.c.post(`/api/admin/pii/${randomUUID()}`, { data: {} })).status()).toBe(404);
  expect((await atendente.c.post("/api/admin/pii/nao-e-uuid", { data: {} })).status()).toBe(404);
  // Passageiro não revela nada.
  expect((await (await registerApi("Passageiro")).c.post(`/api/admin/pii/${driver.userId}`, { data: {} })).status()).toBe(403);
  // 30 por hora (já gastamos 1 + 1 de conta inexistente que também conta).
  let last = 200;
  for (let i = 0; i < 30; i++) last = (await atendente.c.post(`/api/admin/pii/${driver.userId}`, { data: {} })).status();
  expect(last).toBe(429);
  // Fora da fila: um motorista online esquecido aqui disputaria as ofertas dos testes seguintes (rules.spec.ts).
  await driver.c.post("/api/driver/status", { data: { online: false } });
});
