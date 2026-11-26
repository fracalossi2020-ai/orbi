import { and, eq, isNull, lt } from "drizzle-orm";
import { getDb, schema as s } from "@/database";
import { enforceInviteSweep, staffInviteOverdue } from "@/shared/invite";
import { INVITE_TTL_MS } from "@/shared/sessions";
import { isRealProduction } from "@/shared/runtime-config";
import { alertAdmins } from "./access";
import { audit } from "./audit-lite";
import { revokeSessions } from "./auth";
import { cleanupRateLimits } from "./rate-limit-db";

/**
 * Faxina e conferências de segurança que rodam junto do sweeper de corridas, no máximo uma vez por minuto:
 * apaga os contadores de tentativas vencidos e suspende a conta da equipe criada por convite que não ativou a segunda etapa em 24 h.
 */
const state = globalThis as unknown as { __prumoSecSweepAt?: number; __prumoSecSweeping?: boolean };

export async function securitySweep() {
  const now = Date.now();
  if (state.__prumoSecSweeping || now - (state.__prumoSecSweepAt ?? 0) < 60_000) return;
  state.__prumoSecSweeping = true;
  state.__prumoSecSweepAt = now;
  try {
    await cleanupRateLimits();
    // Só em produção de verdade ou com a segunda etapa da equipe exigida (no teste local com a exigência desligada, não suspende).
    if (enforceInviteSweep(isRealProduction(process.env), process.env.PRUMO_REQUIRE_STAFF_MFA !== "false")) await suspendOverdueInvites();
  } finally { state.__prumoSecSweeping = false; }
}

/** Suspende a conta da equipe que passou de 24 h do convite sem ativar a segunda etapa. A primeira conta (script admin:create) não tem convite e nunca entra. */
export async function suspendOverdueInvites() {
  const db = await getDb();
  const rows = await db.select({ id: s.users.id, name: s.users.name, email: s.users.email, status: s.users.status, totpEnabledAt: s.users.totpEnabledAt, invitedAt: s.staffInvites.createdAt })
    .from(s.staffInvites).innerJoin(s.users, eq(s.staffInvites.userId, s.users.id))
    .where(and(eq(s.users.status, "active"), isNull(s.users.totpEnabledAt), lt(s.staffInvites.createdAt, new Date(Date.now() - INVITE_TTL_MS))));
  const done = new Set<string>();
  for (const r of rows) {
    if (done.has(r.id) || !staffInviteOverdue(r)) continue;
    done.add(r.id);
    await db.update(s.users).set({ status: "suspended" }).where(eq(s.users.id, r.id));
    await revokeSessions(r.id);
    await audit(null, "staff.invite_expired", "user", r.id, { reason: "sem segunda etapa em 24 h" });
    await alertAdmins(`Conta da equipe suspensa: ${r.name}`, `A conta da equipe de ${r.name}${r.email ? ` (${r.email})` : ""} foi suspensa porque o convite passou de 24 horas sem a verificação em duas etapas ser ativada. Para dar acesso, crie um convite novo.`);
  }
  return done.size;
}
