import { and, desc, eq, inArray, or, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { randomBytes } from "node:crypto";
import { getDb, schema as s, type Db } from "@/database";
import { ApiError, audit, body, publicRoute, route } from "@/backend/api";
import { cpfHmac, endSession, publicUser, revokeSessions } from "@/backend/auth";
import { cancelScheduledRides } from "@/backend/rides";
import { cpfBlockUntil, deletionProblem, hasDriverHistory, shouldBlockCpf } from "@/shared/account-deletion";
import { ACTIVE_STATUSES } from "@/shared/transitions";
import { rideForExport } from "@/shared/account";
import { removeUploads } from "@/backend/uploads";
import { reauthFields, requireReauth } from "@/backend/reauth";

export const GET = publicRoute<{ action?: string[] }>(async ({ user, params }) => {
  if (!params.action) {
    if (!user) return { user: null };
    // Cidade do endereço cadastrado (hoje só motorista tem endereço): o Orbi Food a usa como "cidade de casa". Só leitura.
    const [d] = await (await getDb()).select({ city: s.drivers.addressCity }).from(s.drivers).where(eq(s.drivers.userId, user.id)).limit(1);
    return { user: { ...publicUser(user), addressCity: d?.city ?? null } };
  }
  if (!user) throw new ApiError(401, "Entre na sua conta para continuar.");
  if (params.action[0] === "export") throw new ApiError(405, "Para baixar seus dados, confirme a senha na tela Minha conta.");
  throw new ApiError(404, "Recurso não encontrado.");
});

/**
 * LGPD, art. 18: portabilidade dos dados do titular. A cópia tem dados pessoais de tudo (corridas, endereços, chat): pede a
 * senha de novo (conta do Google: código no e-mail atual), como o saque e a exclusão da conta. Por isso é POST, não um link.
 */
export const POST = publicRoute<{ action?: string[] }>(async ({ req, user, params }) => {
  if (!user) throw new ApiError(401, "Entre na sua conta para continuar.");
  if (params.action?.[0] !== "export") throw new ApiError(404, "Recurso não encontrado.");
  await requireReauth(user, await body(req, z.object(reauthFields)));
  const db = await getDb();
  const [rides, tickets, notifications, driver, vehicles, ledger, savedPlaces] = await Promise.all([
    db.select().from(s.rides).where(or(eq(s.rides.passengerId, user.id), eq(s.rides.driverId, user.id))).orderBy(desc(s.rides.createdAt)),
    db.select().from(s.tickets).where(eq(s.tickets.userId, user.id)),
    db.select().from(s.notifications).where(eq(s.notifications.userId, user.id)),
    db.select().from(s.drivers).where(eq(s.drivers.userId, user.id)),
    db.select().from(s.vehicles).where(eq(s.vehicles.driverId, user.id)),
    db.select().from(s.ledger).where(eq(s.ledger.driverId, user.id)),
    db.select().from(s.savedPlaces).where(eq(s.savedPlaces.userId, user.id)),
  ]);
  await audit(user.id, "privacy.export", "user", user.id);
  // Fora da cópia: resumo da senha e segredos da verificação em duas etapas.
  const { passwordHash: _p, totpSecret: _t, recoveryCodes: _r, totpLastStep: _l, ...profile } = user;
  // Corridas em que a pessoa dirigiu não levam dados do passageiro.
  const ridesOut = rides.map((r) => rideForExport(r, user.id));
  return new NextResponse(JSON.stringify({ exportedAt: new Date(), profile, driver, vehicles, rides: ridesOut, ledger, tickets, notifications, savedPlaces }, null, 2), {
    headers: { "Content-Type": "application/json", "Content-Disposition": 'attachment; filename="meus-dados-orbi.json"' },
  });
});

const profileSchema = z.object({ name: z.string().trim().min(3, "Informe seu nome completo.").max(80, "O nome pode ter até 80 caracteres.") });

export const PATCH = route(async ({ req, user }) => {
  const v = await body(req, profileSchema);
  const db = await getDb();
  const [u] = await db.update(s.users).set({ name: v.name }).where(eq(s.users.id, user.id)).returning();
  return publicUser(u);
});

/**
 * LGPD: anonimiza a conta. Corridas e lançamentos financeiros ficam, sem dados pessoais,
 * porque a retenção fiscal e contábil é obrigação legal.
 *
 * Tudo acontece numa única transação (ou a conta é anonimizada inteira, ou nada muda). Antes de apagar:
 * - corrida em andamento bloqueia;
 * - saldo diferente de zero ou saque aguardando pagamento bloqueia ("Acerte seu saldo antes de excluir a conta"):
 *   senão o dinheiro que a Orbi deve ao motorista, ou o que ele deve à Orbi, sumiria junto com a conta;
 * - quem teve cadastro de motorista com histórico deixa o HMAC do CPF numa tabela de bloqueio por 180 dias
 *   (o CPF em si não fica guardado): a exclusão não serve para apagar o rastro de um motorista e se cadastrar de novo na hora.
 *   O bloqueio vale só para virar motorista de novo (cpfDriverBlocked); o cadastro de passageiro segue livre.
 *   "Histórico" é só o de motorista (corridas dirigidas e lançamentos do saldo); corridas como passageiro não contam.
 *   Passageiro comum não é bloqueado: a LGPD libera o CPF, como já era.
 * - pagamento Pix ainda pendente no provedor (da pessoa como passageira ou como motorista da corrida) bloqueia;
 * - as corridas agendadas da pessoa são canceladas (sem cobrança).
 */
export const DELETE = route(async ({ req, user }) => {
  // Apagar a conta é irreversível: pede a senha de novo (ou o código no e-mail, em conta do Google).
  await requireReauth(user, await body(req, z.object(reauthFields)));
  const db = await getDb();
  const contactEmails = [user.email, user.pendingEmail].filter((e): e is string => Boolean(e));
  const storedFiles = await db.transaction(async (tx) => {
    // Trava a conta: duas exclusões (ou uma exclusão e um saque) juntas passam uma de cada vez.
    await tx.select({ id: s.users.id }).from(s.users).where(eq(s.users.id, user.id)).for("update");
    const [driverRow] = await tx.select({ cpf: s.drivers.cpf }).from(s.drivers).where(eq(s.drivers.userId, user.id)).for("update");
    const open = await tx.select({ status: s.rides.status }).from(s.rides).where(or(eq(s.rides.passengerId, user.id), eq(s.rides.driverId, user.id)));
    if (open.some((r) => ACTIVE_STATUSES.includes(r.status))) throw new ApiError(409, "Encerre a corrida em andamento antes de excluir a conta.");
    const [{ balance }] = await tx.select({ balance: sql<number>`coalesce(sum(${s.ledger.amountCents}),0)::int` }).from(s.ledger).where(eq(s.ledger.driverId, user.id));
    const [{ pending }] = await tx.select({ pending: sql<number>`count(*)::int` }).from(s.withdrawals).where(and(eq(s.withdrawals.driverId, user.id), eq(s.withdrawals.status, "requested")));
    // Pix pendente no provedor: se a conta sumisse agora, a confirmação cairia numa conta anonimizada.
    const [{ pixPending }] = await tx.select({ pixPending: sql<number>`count(*)::int` }).from(s.payments)
      .innerJoin(s.rides, eq(s.rides.id, s.payments.rideId))
      .where(and(eq(s.payments.status, "pending"), eq(s.payments.provider, "mercadopago"), or(eq(s.rides.passengerId, user.id), eq(s.rides.driverId, user.id))));
    const blocked = deletionProblem({ balanceCents: balance, openWithdrawals: pending, pendingPixPayments: pixPending });
    if (blocked) throw new ApiError(409, blocked);

    // Bloqueio do CPF (só o HMAC) para quem foi motorista com histórico REAL de motorista: corridas dirigidas ou lançamentos
    // do saldo. Corridas feitas como passageiro não contam.
    const [{ ledgerRows }] = await tx.select({ ledgerRows: sql<number>`count(*)::int` }).from(s.ledger).where(eq(s.ledger.driverId, user.id));
    const [{ ridesAsDriver }] = await tx.select({ ridesAsDriver: sql<number>`count(*)::int` }).from(s.rides).where(and(eq(s.rides.driverId, user.id), eq(s.rides.status, "completed")));
    const hasHistory = hasDriverHistory({ ridesAsDriver, ledgerRows });
    if (shouldBlockCpf({ wasDriver: !!driverRow, hasHistory })) {
      const until = cpfBlockUntil();
      for (const cpf of new Set([user.cpf, driverRow?.cpf].filter((c): c is string => Boolean(c)))) {
        await tx.insert(s.deletedCpfBlocks).values({ cpfHmac: cpfHmac(cpf), blockedUntil: until })
          .onConflictDoUpdate({ target: s.deletedCpfBlocks.cpfHmac, set: { blockedUntil: until } });
      }
    }
    await cancelScheduledRides(user.id, "Conta excluída pelo titular", tx as unknown as Db);

    await tx.insert(s.privacyRequests).values({ userId: user.id, kind: "delete", status: "done" });
    await tx.update(s.users).set({
      // O CPF também sai: é dado pessoal e, liberado, a pessoa pode criar uma conta nova com ele (salvo o bloqueio acima).
      name: "Conta excluída", email: null, pendingEmail: null, emailVerifiedAt: null, phone: null, cpf: null, status: "deleted", passwordHash: randomBytes(32).toString("hex"),
    }).where(eq(s.users.id, user.id));
    // Texto livre escrito pela pessoa (chamados e chat) e contatos de marketing também são dados pessoais. Sem retenção legal:
    // o chamado e a mensagem ficam no banco só como registro vazio, para não quebrar o histórico das corridas.
    await tx.update(s.tickets).set({ subject: "[removido a pedido do titular]", body: "[removido a pedido do titular]", response: null }).where(eq(s.tickets.userId, user.id));
    await tx.update(s.rideMessages).set({ body: "[mensagem removida]" }).where(eq(s.rideMessages.senderId, user.id));
    const leadMatch = [contactEmails.length ? inArray(s.leads.email, contactEmails) : undefined, user.phone ? eq(s.leads.phone, user.phone) : undefined].filter((c) => c !== undefined);
    if (leadMatch.length) await tx.delete(s.leads).where(or(...leadMatch));
    // Retenção legal: o VALOR e a DATA dos saques e lançamentos ficam (obrigação fiscal e contábil, a mesma das corridas),
    // mas a chave Pix (CPF, telefone ou e-mail da pessoa) sai e a placa do veículo é trocada por um código sem ligação.
    await tx.update(s.withdrawals).set({ pixKey: "[removida]" }).where(eq(s.withdrawals.driverId, user.id));
    const cars = await tx.select({ id: s.vehicles.id }).from(s.vehicles).where(eq(s.vehicles.driverId, user.id));
    for (const c of cars) await tx.update(s.vehicles).set({ plate: `EXC-${randomBytes(6).toString("hex").toUpperCase()}` }).where(eq(s.vehicles.id, c.id));
    // Endereços salvos e dados de quem viajou no lugar da conta também são pessoais.
    await tx.delete(s.savedPlaces).where(eq(s.savedPlaces.userId, user.id));
    await tx.update(s.rides).set({ riderName: null, riderPhone: null }).where(eq(s.rides.passengerId, user.id));
    // Documentos enviados (CNH, selfie, comprovantes): os registros saem do banco aqui e os arquivos do disco depois do commit.
    const docs = await tx.select({ storedName: s.documents.storedName }).from(s.documents).where(eq(s.documents.driverId, user.id));
    await tx.delete(s.documents).where(eq(s.documents.driverId, user.id));
    await tx.delete(s.notifications).where(eq(s.notifications.userId, user.id));
    await tx.delete(s.verificationCodes).where(eq(s.verificationCodes.userId, user.id));
    await tx.update(s.drivers).set({
      pixKey: null, pixKeyType: null, birthDate: null, cnhCategory: null, cnhFirstLicenseAt: null, cnhExpiresAt: null, heading: null, accuracyM: null, locationAt: null, reviewNote: null,
      status: "suspended", online: false, lat: null, lng: null, cpf: "", cnh: "", addressCep: null, addressStreet: null, addressNumber: null, addressComplement: null, addressDistrict: null, addressCity: null, addressState: null, addressVerified: false,
    }).where(eq(s.drivers.userId, user.id));
    await tx.update(s.users).set({ totpSecret: null, totpEnabledAt: null, recoveryCodes: null, googleSub: null }).where(eq(s.users.id, user.id));
    return docs.map((d) => d.storedName);
  });
  await removeUploads(storedFiles);
  await audit(user.id, "privacy.delete", "user", user.id);
  await revokeSessions(user.id);
  await endSession();
  return { ok: true };
});
