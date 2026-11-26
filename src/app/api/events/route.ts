import { and, eq, gt, isNull } from "drizzle-orm";
import { getDb, schema as s } from "@/database";
import { STAFF_CHANNEL, subscribe, userChannel } from "@/backend/bus";
import { publicRoute, ApiError } from "@/backend/api";
import { STAFF } from "@/shared/permissions";
import { sessionIdle } from "@/shared/sessions";

export const dynamic = "force-dynamic";

/** No máximo 5 conexões abertas por usuário (abas e aparelhos): evita esgotar o servidor com conexões penduradas. */
const MAX_PER_USER = 5;
const open = (globalThis as unknown as { __prumoSse?: Map<string, number> });
const counts = (open.__prumoSse ??= new Map<string, number>());

/** A sessão ainda vale? Conferida a cada ping: sair, trocar a senha, suspender a conta ou a equipe ficar parada encerram o fluxo. */
async function sessionAlive(sessionId: string, userId: string) {
  const db = await getDb();
  const [row] = await db.select({ lastSeenAt: s.sessions.lastSeenAt, role: s.users.role, status: s.users.status }).from(s.sessions)
    .innerJoin(s.users, eq(s.sessions.userId, s.users.id))
    .where(and(eq(s.sessions.id, sessionId), eq(s.sessions.userId, userId), isNull(s.sessions.revokedAt), gt(s.sessions.expiresAt, new Date())));
  return !!row && row.status === "active" && !sessionIdle(STAFF.includes(row.role), row.lastSeenAt);
}

/** Canal SSE por usuário: avisa que algo mudou; o cliente busca o estado de novo pela API. */
export const GET = publicRoute(async ({ req, user, session }) => {
  if (!user || !session) throw new ApiError(401, "Entre na sua conta para continuar.");
  if ((counts.get(user.id) ?? 0) >= MAX_PER_USER) throw new ApiError(429, "Muitas conexões abertas. Feche outras abas e tente de novo.");
  counts.set(user.id, (counts.get(user.id) ?? 0) + 1);
  const encoder = new TextEncoder();
  // Encerrar é idempotente: aborto do pedido, cancelamento do fluxo e sessão revogada podem chegar juntos.
  let cleanup = () => {};
  let closed = false;
  const stream = new ReadableStream({
    start(controller) {
      const send = (topic: string) => {
        try { controller.enqueue(encoder.encode(`data: ${topic}

`)); } catch { /* conexão encerrada */ }
      };
      send("hello");
      const unsubs = [subscribe(userChannel(user.id), send)];
      if (STAFF.includes(user.role)) unsubs.push(subscribe(STAFF_CHANNEL, send));
      const ping = setInterval(() => {
        sessionAlive(session.id, user.id).then((alive) => { if (alive) send("ping"); else cleanup(); }).catch(() => send("ping"));
      }, 25000);
      cleanup = () => {
        if (closed) return;
        closed = true;
        clearInterval(ping);
        unsubs.forEach((u) => u());
        const n = (counts.get(user.id) ?? 1) - 1;
        if (n <= 0) counts.delete(user.id); else counts.set(user.id, n);
        try { controller.close(); } catch { /* já fechada */ }
      };
      req.signal.addEventListener("abort", () => cleanup());
    },
    cancel() { cleanup(); },
  });
  return new Response(stream, { headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache, no-transform", Connection: "keep-alive" } });
});
