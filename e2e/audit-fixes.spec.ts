import fs from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";
import { adminApi, approvedDriverApi, driveRide, PASSWORD, registerApi, RIDE_BODY, RIDE_ORIGIN } from "./helpers";

test.describe.configure({ mode: "serial" });

const outboxDir = () => path.join(process.cwd(), ".data-e2e", "outbox");
const mailsAbout = (rideId: string) => (fs.existsSync(outboxDir()) ? fs.readdirSync(outboxDir()) : [])
  .map((f) => fs.readFileSync(path.join(outboxDir(), f), "utf8")).filter((t) => t.includes(`Corrida: ${rideId}`)).length;

/** Motorista fora da fila: os outros testes (e este arquivo) não podem receber oferta dele. */
const offline = async (c: { post: (u: string, o: object) => Promise<unknown> }) => { await c.post("/api/driver/status", { data: { online: false } }); };

/** Passageiro pede, o motorista aceita. */
async function acceptedRide() {
  const admin = await adminApi();
  const d = await approvedDriverApi(admin);
  const pass = await registerApi("Passageiro");
  const ride = await (await pass.c.post("/api/rides", { data: RIDE_BODY(d.categoryId) })).json();
  const offer = (await (await d.c.get("/api/driver/state")).json()).offer;
  expect((await d.c.post(`/api/driver/offers/${offer.id}`, { data: { accept: true } })).ok()).toBeTruthy();
  return { admin, d, pass, ride };
}

test("SOS: fora da corrida ativa dá 409 e o segundo SOS da mesma corrida não manda novo e-mail", async () => {
  const admin = await adminApi();
  const pass = await registerApi("Passageiro");
  const d = await approvedDriverApi(admin);
  // Sem motorista ainda (procurando): não vale
  const searching = await (await pass.c.post("/api/rides", { data: RIDE_BODY(d.categoryId) })).json();
  const early = await pass.c.post(`/api/rides/${searching.id}/emergency`, { data: {} });
  expect(early.status()).toBe(409);
  expect((await early.json()).error).toContain("corrida em andamento");
  // Cancelada: também não
  expect((await pass.c.post(`/api/rides/${searching.id}/cancel`, { data: { reason: "teste" } })).ok()).toBeTruthy();
  expect((await pass.c.post(`/api/rides/${searching.id}/emergency`, { data: {} })).status()).toBe(409);
  await offline(d.c);

  // Aceita: o primeiro vale, o segundo só atualiza o alerta
  const a1 = await acceptedRide();
  const { pass: p2, ride } = a1;
  const first = await p2.c.post(`/api/rides/${ride.id}/emergency`, { data: { lat: -19.47, lng: -42.54 } });
  expect(first.ok(), await first.text()).toBeTruthy();
  await expect.poll(() => mailsAbout(ride.id)).toBeGreaterThan(0);
  const mails = mailsAbout(ride.id);
  const second = await p2.c.post(`/api/rides/${ride.id}/emergency`, { data: { lat: -19.48, lng: -42.55 } });
  expect(second.ok()).toBeTruthy();
  expect((await second.json()).repeated).toBe(true);
  await new Promise((r) => setTimeout(r, 800));
  expect(mailsAbout(ride.id)).toBe(mails);
  const rows = ((await (await admin.get("/api/admin/emergencies")).json()).rows as { rideId: string; triggerCount: number; actorLat: number }[]).filter((r) => r.rideId === ride.id);
  expect(rows).toHaveLength(1);
  expect(rows[0].triggerCount).toBe(2);
  expect(rows[0].actorLat).toBeCloseTo(-19.48, 3);
  await offline(a1.d.c);

  // Análise duas vezes: a segunda é 409
  const id = ((await (await admin.get("/api/admin/emergencies")).json()).rows as { id: string; rideId: string }[]).find((r) => r.rideId === ride.id)!.id;
  expect((await admin.post(`/api/admin/emergencies/${id}`, { data: { note: "Tudo certo com as partes." } })).ok()).toBeTruthy();
  expect((await admin.post(`/api/admin/emergencies/${id}`, { data: { note: "De novo, outra nota." } })).status()).toBe(409);
});

test("admin encerra (cobrando) e cancela corrida presa em viagem, com motivo obrigatório", async () => {
  // Encerrar cobrando o valor informado
  const a = await acceptedRide();
  await driveRide(a.d.c, a.ride.id, ["arrive", "start"]);
  const noReason = await a.admin.post(`/api/admin/rides/${a.ride.id}/close`, { data: {} });
  expect(noReason.status()).toBe(400);
  const tooMuch = await a.admin.post(`/api/admin/rides/${a.ride.id}/close`, { data: { reason: "Motorista sem sinal", amountCents: 99_999_999 } });
  expect(tooMuch.status()).toBe(400);
  const closed = await a.admin.post(`/api/admin/rides/${a.ride.id}/close`, { data: { reason: "Motorista sem sinal", amountCents: 1500 } });
  expect(closed.ok(), await closed.text()).toBeTruthy();
  expect((await closed.json()).chargedCents).toBe(1500);
  const view = await (await a.pass.c.get(`/api/rides/${a.ride.id}`)).json();
  expect(view.status).toBe("completed");
  expect(view.totalCents).toBe(1500);
  const fin = await (await a.d.c.get("/api/driver/finance")).json();
  expect(fin.entries.some((e: { type: string }) => e.type === "cash_due")).toBe(true);
  const rows = (await (await a.admin.get("/api/admin/rides")).json()).rows as { id: string; reviewReason: string | null }[];
  expect(rows.find((r) => r.id === a.ride.id)?.reviewReason).toContain("Encerrada pela equipe");
  // Já concluída: não encerra nem cancela de novo
  expect((await a.admin.post(`/api/admin/rides/${a.ride.id}/close`, { data: { reason: "Repetido de novo" } })).status()).toBe(409);
  expect((await a.admin.post(`/api/admin/rides/${a.ride.id}/cancel`, { data: { reason: "Repetido de novo" } })).status()).toBe(409);

  // Cancelar sem cobrança
  const b = await acceptedRide();
  await driveRide(b.d.c, b.ride.id, ["arrive", "start"]);
  const cancelled = await b.admin.post(`/api/admin/rides/${b.ride.id}/cancel`, { data: { reason: "Passageiro não localizado" } });
  expect(cancelled.ok(), await cancelled.text()).toBeTruthy();
  const v2 = await (await b.pass.c.get(`/api/rides/${b.ride.id}`)).json();
  expect(v2.status).toBe("cancelled");
  const fin2 = await (await b.d.c.get("/api/driver/finance")).json();
  expect(fin2.entries.filter((e: { type: string }) => e.type === "cash_due")).toHaveLength(0);
  // O motorista fica livre para outra corrida
  expect((await (await b.d.c.get("/api/driver/state")).json()).ride).toBeNull();
  await offline(a.d.c); await offline(b.d.c);
});

test("motorista encerra longe do destino só com motivo; cobra o trecho e marca para revisão", async () => {
  const a = await acceptedRide();
  await driveRide(a.d.c, a.ride.id, ["arrive", "start"]);
  // Continua perto da partida, a mais de 500 m do destino
  await a.d.c.post("/api/driver/location", { data: RIDE_ORIGIN });
  const noReason = await a.d.c.post(`/api/rides/${a.ride.id}/complete`, { data: {} });
  expect(noReason.status()).toBe(409);
  expect((await noReason.json()).code).toBe("far_from_dest");
  const short = await a.d.c.post(`/api/rides/${a.ride.id}/complete`, { data: { reason: "ok" } });
  expect(short.status()).toBe(409);
  const done = await a.d.c.post(`/api/rides/${a.ride.id}/complete`, { data: { reason: "Passageiro desceu antes" } });
  expect(done.ok(), await done.text()).toBeTruthy();
  const view = await (await a.pass.c.get(`/api/rides/${a.ride.id}`)).json();
  expect(view.status).toBe("completed");
  const before = (await (await a.admin.get("/api/admin/rides")).json()).rows.find((r: { id: string }) => r.id === a.ride.id);
  expect(before.reviewReason).toContain("Passageiro desceu antes");
  expect(before.totalCents).toBeLessThan(a.ride.totalCents);
  await offline(a.d.c);
});

test("exclusão de conta é bloqueada com saldo diferente de zero e liberada sem saldo", async () => {
  const a = await acceptedRide();
  await driveRide(a.d.c, a.ride.id);
  // Corrida em dinheiro deixa a comissão a acertar: saldo negativo
  const blocked = await a.d.c.delete("/api/me", { data: { password: PASSWORD } });
  expect(blocked.status()).toBe(409);
  expect((await blocked.json()).error).toContain("Acerte seu saldo antes de excluir a conta");
  // A conta continua de pé
  expect((await a.d.c.get("/api/me")).ok()).toBeTruthy();
  await offline(a.d.c);

  // Passageiro sem saldo exclui normalmente
  const ok = await a.pass.c.delete("/api/me", { data: { password: PASSWORD } });
  expect(ok.ok(), await ok.text()).toBeTruthy();
});

test("motorista com oferta pendente não recebe segunda oferta e não aceita com corrida ativa", async () => {
  const admin = await adminApi();
  const d = await approvedDriverApi(admin);
  const p1 = await registerApi("Passageiro");
  const p2 = await registerApi("Passageiro");
  // Dois pedidos juntos: o mesmo motorista nunca tem duas ofertas pendentes
  const rides = await Promise.all([p1, p2].map(async (p) => (await (await p.c.post("/api/rides", { data: RIDE_BODY(d.categoryId) })).json()) as { id: string }));
  const state = await (await d.c.get("/api/driver/state")).json();
  expect(state.offer).not.toBeNull();
  const accepted = await d.c.post(`/api/driver/offers/${state.offer.id}`, { data: { accept: true } });
  expect(accepted.ok()).toBeTruthy();
  // Já em corrida: não aparece outra oferta
  await new Promise((r) => setTimeout(r, 600));
  expect((await (await d.c.get("/api/driver/state")).json()).offer).toBeNull();
  await offline(d.c);
  // A corrida que ficou sem motorista não pode sobrar na fila e ser oferecida a motoristas de outros testes.
  await Promise.all([p1, p2].map((p, i) => p.c.post(`/api/rides/${rides[i].id}/cancel`, { data: { reason: "fim do teste" } })));
});
