import fs from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";
import { ADMIN, adminApi, approvedDriverApi, gpsContext, login, registerApi, RIDE_BODY } from "./helpers";

test.describe.configure({ mode: "serial" });

const outboxFiles = () => {
  const dir = path.join(process.cwd(), ".data-e2e", "outbox");
  return fs.existsSync(dir) ? fs.readdirSync(dir) : [];
};

test("emergência: folha com 190 e placa, alerta na equipe, e-mail e análise no painel", async ({ browser }) => {
  test.setTimeout(180_000);
  const admin = await adminApi();
  const d = await approvedDriverApi(admin);
  const pass = await registerApi("Passageiro");
  const passEmail = (await (await pass.c.get("/api/me")).json()).user.email as string;
  const driverEmail = (await (await d.c.get("/api/me")).json()).user.email as string;

  const ride = await (await pass.c.post("/api/rides", { data: RIDE_BODY(d.categoryId) })).json();
  const offer = (await (await d.c.get("/api/driver/state")).json()).offer;
  expect((await d.c.post(`/api/driver/offers/${offer.id}`, { data: { accept: true } })).ok()).toBeTruthy();
  const view = await (await pass.c.get(`/api/rides/${ride.id}`)).json();
  const plate = view.vehicle.plate as string;
  expect(plate).toBeTruthy();

  const mailsBefore = outboxFiles().length;

  // Passageiro: a folha abre, mostra o 190 com a placa e fecha com Esc
  const pCtx = await gpsContext(browser);
  const p = await pCtx.newPage();
  await login(p, passEmail, "senha-de-teste");
  await p.waitForURL("**/passageiro**");
  await p.getByTestId("sos-open").click();
  const sheet = p.getByTestId("sos-sheet");
  await expect(sheet).toBeVisible();
  const call = p.getByTestId("sos-call-190");
  await expect(call).toHaveAttribute("href", "tel:190");
  await expect(call).toBeFocused();
  await expect(p.getByTestId("sos-script")).toContainText(plate);
  await expect(p.getByTestId("sos-script")).toContainText("Estou num carro");
  await expect(p.getByTestId("sos-call-192")).toHaveAttribute("href", "tel:192");
  const wa = await p.getByTestId("sos-trusted").getAttribute("href");
  expect(wa).toMatch(/^https:\/\/wa\.me\/\?text=/);
  expect(decodeURIComponent(wa!)).toContain(`/v/${view.shareToken}`);
  await expect(sheet).toContainText("não é um plantão 24 horas");
  await p.keyboard.press("Escape");
  await expect(sheet).toHaveCount(0);

  // Servidor: ocorrência gravada com a posição de quem acionou
  await expect.poll(async () => ((await (await admin.get("/api/admin/emergencies")).json()).rows as { rideId: string }[]).filter((r) => r.rideId === ride.id).length).toBe(1);
  const rows = (await (await admin.get("/api/admin/emergencies")).json()).rows as Record<string, unknown>[];
  const em = rows.find((r) => r.rideId === ride.id)!;
  expect(em.actor).toBe("passenger");
  expect(em.actorLat).toBeCloseTo(-19.4683, 3);
  expect(em.reviewedAt).toBeNull();

  // E-mail para quem é admin ou atendente
  await expect.poll(() => outboxFiles().length).toBeGreaterThan(mailsBefore);
  const mail = outboxFiles().map((f) => fs.readFileSync(path.join(process.cwd(), ".data-e2e", "outbox", f), "utf8")).find((t) => t.includes(`Corrida: ${ride.id}`));
  expect(mail).toContain("/admin/emergencias");

  // Motorista também tem o botão, com o roteiro falando do passageiro
  const dCtx = await gpsContext(browser);
  const dp = await dCtx.newPage();
  await login(dp, driverEmail, "senha-de-teste");
  await dp.waitForURL(/\/(passageiro|motorista)/);
  await dp.goto("/motorista");
  await dp.getByTestId("sos-open").click();
  await expect(dp.getByTestId("sos-call-190")).toHaveAttribute("href", "tel:190");
  await expect(dp.getByTestId("sos-script")).toContainText(plate);
  await expect(dp.getByTestId("sos-script")).toContainText("passageiro");
  await dp.getByRole("button", { name: "Fechar" }).click();
  // Um alerta aberto por corrida: o acionamento do motorista atualiza o do passageiro (mais um acionamento, mesma ocorrência).
  await expect.poll(async () => ((await (await admin.get("/api/admin/emergencies")).json()).rows as { rideId: string; triggerCount: number }[]).filter((r) => r.rideId === ride.id).map((r) => r.triggerCount)).toEqual([2]);

  // Painel: aviso em destaque, lista e análise com nota
  const aCtx = await browser.newContext({ baseURL: "http://localhost:3100", viewport: { width: 1280, height: 900 } });
  const a = await aCtx.newPage();
  await login(a, ADMIN.identifier, ADMIN.password);
  await a.waitForURL("**/admin");
  await expect(a.getByTestId("sos-banner")).toContainText("sem análise");
  await a.goto("/admin/emergencias");
  const item = a.getByTestId("emergency-item").filter({ hasText: ride.id.slice(0, 8) }).first();
  await expect(item).toBeVisible();
  await expect(item.getByRole("link", { name: /Posição de quem acionou|Motorista/ }).first()).toHaveAttribute("href", /google\.com\/maps\?q=/);
  await item.getByLabel("Nota da análise").fill("Conversei com as partes, tudo certo.");
  await item.getByRole("button", { name: "Marcar como analisada" }).click();
  await expect(item.getByText("Conversei com as partes, tudo certo.")).toBeVisible();
  const after = (await (await admin.get("/api/admin/emergencies")).json()).rows as { rideId: string; reviewedAt: string | null; reviewNote: string | null }[];
  const mine = after.filter((r) => r.rideId === ride.id);
  expect(mine.some((r) => r.reviewedAt && r.reviewNote === "Conversei com as partes, tudo certo.")).toBe(true);

  // Aviso de limite (throttled) e erro 409 aparecem em texto, com o 190 sempre à mão
  const tCtx = await gpsContext(browser);
  const tp = await tCtx.newPage();
  await login(tp, passEmail, "senha-de-teste");
  await tp.waitForURL("**/passageiro**");
  await tp.route(`**/api/rides/${ride.id}/emergency`, (r) => r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, throttled: true, message: "Limite de alertas atingido. Ligue 190." }) }));
  await tp.getByTestId("sos-open").click();
  await expect(tp.getByTestId("sos-notice")).toContainText("Limite de alertas atingido");
  await expect(tp.getByTestId("sos-notice")).toHaveAttribute("role", "alert");
  await expect(tp.getByTestId("sos-call-190")).toBeVisible();
  await tp.keyboard.press("Escape");
  await tp.unroute(`**/api/rides/${ride.id}/emergency`);
  await tp.route(`**/api/rides/${ride.id}/emergency`, (r) => r.fulfill({ status: 409, contentType: "application/json", body: JSON.stringify({ error: "Fora do período permitido." }) }));
  await tp.getByTestId("sos-open").click();
  await expect(tp.getByTestId("sos-notice")).toContainText("Fora do período permitido.");
  await tCtx.close();

  // Posição inválida não derruba o alerta nem é gravada
  const bad = await pass.c.post(`/api/rides/${ride.id}/emergency`, { data: { lat: "x", lng: 999 } });
  expect(bad.ok()).toBeTruthy();
  await pCtx.close(); await dCtx.close(); await aCtx.close();
});
