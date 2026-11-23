import { expect, test } from "@playwright/test";
import { adminApi, approvedDriverApi, driveRide, registerApi, RIDE_BODY } from "./helpers";

test.describe.configure({ mode: "serial" });

test("dívida: corrida em dinheiro bloqueia no limite, motorista informa o pagamento e a equipe confirma", async () => {
  const admin = await adminApi();
  // Limite pequeno (R$ 1,00) para uma corrida em dinheiro já estourar; voltamos ao padrão no fim.
  expect((await admin.post("/api/admin/settings", { data: { debt: { limitCents: 100 }, orbiPix: { key: "pix@orbi.test", name: "Orbi Mobilidade" } } })).ok()).toBeTruthy();
  try {
    const d = await approvedDriverApi(admin);
    const pass = await registerApi("Passageiro");
    const ride = await (await pass.c.post("/api/rides", { data: RIDE_BODY(d.categoryId, { paymentMethod: "cash" }) })).json();
    const offer = (await (await d.c.get("/api/driver/state")).json()).offer;
    expect((await d.c.post(`/api/driver/offers/${offer.id}`, { data: { accept: true } })).ok()).toBeTruthy();
    await driveRide(d.c, ride.id);

    // 1. A parte da Orbi virou dívida e o motorista chegou ao limite.
    const fin = await (await d.c.get("/api/driver/finance")).json();
    expect(fin.balanceCents).toBeLessThan(0);
    expect(fin.debt.cents).toBe(-fin.balanceCents);
    expect(fin.debt.level).toBe("blocked");
    expect(fin.debt.pix).toEqual({ key: "pix@orbi.test", name: "Orbi Mobilidade" });

    // 2. Bloqueado: não volta a ficar online.
    await d.c.post("/api/driver/status", { data: { online: false } });
    const online = await d.c.post("/api/driver/status", { data: { online: true, lat: -19.4683, lng: -42.5367 } });
    expect(online.status()).toBe(409);
    expect(await online.text()).toContain("Quite o saldo com a Orbi para voltar a dirigir");

    // 3. Pedido de quitação: valor acima da dívida é recusado, e só um pendente por vez.
    expect((await d.c.post("/api/driver/settlements", { data: { amountCents: fin.debt.cents + 1 } })).status()).toBe(409);
    const first = await d.c.post("/api/driver/settlements", { data: { amountCents: fin.debt.cents, note: "E2E123" } });
    expect(first.ok(), await first.text()).toBeTruthy();
    expect((await d.c.post("/api/driver/settlements", { data: { amountCents: 100 } })).status()).toBe(409);
    // Pedir não muda o saldo: o crédito só nasce com a confirmação.
    expect((await (await d.c.get("/api/driver/finance")).json()).balanceCents).toBe(fin.balanceCents);

    // 4. A equipe recusa (motivo obrigatório); o motorista vê o motivo e pode pedir de novo.
    const pending = ((await (await admin.get("/api/admin/payments")).json()).settlements as { id: string; status: string; driverName: string }[]).find((x) => x.status === "pending")!;
    expect(pending).toBeTruthy();
    expect((await admin.post(`/api/admin/settlements/${pending.id}`, { data: { status: "rejected" } })).status()).toBe(400);
    expect((await admin.post(`/api/admin/settlements/${pending.id}`, { data: { status: "rejected", reason: "Pix não localizado" } })).ok()).toBeTruthy();
    expect((await admin.post(`/api/admin/settlements/${pending.id}`, { data: { status: "confirmed" } })).status()).toBe(409);
    expect((await (await d.c.get("/api/driver/finance")).json()).debt.last.rejectReason).toBe("Pix não localizado");
    expect((await d.c.post("/api/driver/settlements", { data: { amountCents: fin.debt.cents } })).ok()).toBeTruthy();

    // 5. Confirmada: crédito no saldo, auditoria e motorista liberado.
    const again = ((await (await admin.get("/api/admin/payments")).json()).settlements as { id: string; status: string }[]).find((x) => x.status === "pending")!;
    const done = await admin.post(`/api/admin/settlements/${again.id}`, { data: { status: "confirmed" } });
    expect(done.ok(), await done.text()).toBeTruthy();
    expect((await done.json()).unblocked).toBe(true);
    const after = await (await d.c.get("/api/driver/finance")).json();
    expect(after.balanceCents).toBe(0);
    expect(after.entries.some((e: { type: string; amountCents: number }) => e.type === "debt_settlement" && e.amountCents === fin.debt.cents)).toBe(true);
    const back = await d.c.post("/api/driver/status", { data: { online: true, lat: -19.4683, lng: -42.5367 } });
    expect(back.ok(), await back.text()).toBeTruthy();
    await d.c.post("/api/driver/status", { data: { online: false } });
  } finally {
    await admin.post("/api/admin/settings", { data: { debt: { limitCents: 15000 } } });
  }
});

test("dívida: quem está no limite não recebe oferta de corrida", async () => {
  const admin = await adminApi();
  expect((await admin.post("/api/admin/settings", { data: { debt: { limitCents: 100 } } })).ok()).toBeTruthy();
  try {
    const d = await approvedDriverApi(admin);
    // Online antes de dever: fica na fila; a corrida em dinheiro de outro passageiro gera a dívida e a próxima não vem para ele.
    const p1 = await registerApi("Passageiro");
    const r1 = await (await p1.c.post("/api/rides", { data: RIDE_BODY(d.categoryId, { paymentMethod: "cash" }) })).json();
    const o1 = (await (await d.c.get("/api/driver/state")).json()).offer;
    expect((await d.c.post(`/api/driver/offers/${o1.id}`, { data: { accept: true } })).ok()).toBeTruthy();
    await driveRide(d.c, r1.id);
    expect((await (await d.c.get("/api/driver/finance")).json()).debt.level).toBe("blocked");

    const p2 = await registerApi("Passageiro");
    const r2 = await (await p2.c.post("/api/rides", { data: RIDE_BODY(d.categoryId, { paymentMethod: "cash" }) })).json();
    expect((await (await d.c.get("/api/driver/state")).json()).offer).toBeNull();
    await p2.c.post(`/api/rides/${r2.id}/cancel`, { data: {} });
    await d.c.post("/api/driver/status", { data: { online: false } });
  } finally {
    await admin.post("/api/admin/settings", { data: { debt: { limitCents: 15000 } } });
  }
});
