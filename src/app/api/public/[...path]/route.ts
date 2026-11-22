import { and, eq } from "drizzle-orm";
import { cookies } from "next/headers";
import { z } from "zod";
import { getDb, schema as s } from "@/database";
import { ApiError, audit, body, publicRoute, staffMissingMfa } from "@/backend/api";
import { checkRateLimit } from "@/backend/auth";
import { clientIp } from "@/backend/security";
import { rideView } from "@/backend/rides";
import { publish, STAFF_CHANNEL } from "@/backend/bus";
import { can } from "@/shared/permissions";
import { isValidBrPhone } from "@/shared/validation";
import { emailDomainExists } from "@/backend/verify";
import { NextResponse } from "next/server";
import { publicPulse, publicSupport, publicTariffs } from "@/backend/public-data";
import { getSetting } from "@/database/seed";
import { MOTO_LEAD_KIND, MOTO_LEAD_MESSAGE } from "@/shared/moto-soon";
import { DEFAULT_DRIVER_RULES, type DriverRules, withDefaultRules } from "@/shared/driver-rules";

type P = { path: string[] };

const LIVE: string[] = ["searching", "accepted", "arrived", "in_progress"];

export const GET = publicRoute<P>(async ({ params }) => {
  const [what, arg] = params.path;
  // Dados abertos do site: tarifas do painel, motoristas online por cidade (só a contagem) e contato do atendimento.
  const cache = (data: unknown, seconds: number) => NextResponse.json(data, { headers: { "Cache-Control": `public, max-age=${seconds}` } });
  if (what === "tariffs") return cache({ cities: await publicTariffs() }, 60);
  if (what === "pulse") return cache({ cities: await publicPulse() }, 20);
  if (what === "support") return cache(await publicSupport(), 300);
  if (what === "driver-rules") return cache(await getSetting<Partial<DriverRules>>(await getDb(), "driverRules", DEFAULT_DRIVER_RULES).then(withDefaultRules), 300);
  if (what === "share" && arg) {
    const db = await getDb();
    const [ride] = await db.select().from(s.rides).where(eq(s.rides.shareToken, arg));
    if (!ride) throw new ApiError(404, "Este link de viagem não existe.");
    // Encerrada a corrida, o link deixa de expor rota e motorista.
    if (!LIVE.includes(ride.status)) return { ended: true, status: ride.status };
    return rideView(ride, "share");
  }
  throw new ApiError(404, "Recurso não encontrado.");
});

const leadSchema = z.object({
  kind: z.enum(["passageiro", "motorista", "parceiro", "contato"]),
  name: z.string().trim().min(2, "Informe seu nome.").max(80, "O nome pode ter até 80 caracteres."),
  email: z.string().trim().toLowerCase().email("E-mail inválido."),
  phone: z.string().trim().max(30).refine((v) => !v || isValidBrPhone(v), "Telefone inválido: use DDD e número.").optional(),
  city: z.string().trim().max(80).optional(),
  message: z.string().trim().max(2000).optional(),
  consent: z.literal(true, { error: "Autorize o contato para enviar." }),
});
const motoInterestSchema = leadSchema.pick({ name: true, email: true, consent: true });
const identitySchema = z.object({ identity: z.enum(["a", "b", "c", "d"]), official: z.boolean().default(false) });

export const POST = publicRoute<P>(async ({ req, user, params }) => {
  const [what] = params.path;
  const db = await getDb();
  if (what === "leads") {
    if (!checkRateLimit(`lead:${clientIp(req)}`, 10, 60 * 60_000)) throw new ApiError(429, "Muitos envios. Tente de novo mais tarde.");
    const v = await body(req, leadSchema);
    if (!(await emailDomainExists(v.email))) throw new ApiError(400, "Este e-mail não pode receber mensagens. Confira o que digitou.");
    await db.insert(s.leads).values(v);
    publish(STAFF_CHANNEL, "lead");
    return { ok: true };
  }
  // Orbi Moto: em breve. Reaproveita a tabela de interessados (kind "moto"), sem migração.
  // Logado: usa o nome e o contato da conta, sem corpo. Anônimo: nome, e-mail e consentimento, como no formulário do site.
  if (what === "moto-interest") {
    if (!checkRateLimit(`moto-interest:${clientIp(req)}`, 10, 60 * 60_000)) throw new ApiError(429, "Muitos envios. Tente de novo mais tarde.");
    let v: { name: string; email: string; phone?: string | null };
    if (user) {
      v = { name: user.name, email: user.email ?? `conta-${user.id}@sem-email.orbi`, phone: user.phone };
    } else {
      v = await body(req, motoInterestSchema);
      if (!(await emailDomainExists(v.email))) throw new ApiError(400, "Este e-mail não pode receber mensagens. Confira o que digitou.");
    }
    // Um aviso por e-mail (contas só com celular usam um e-mail interno da conta): repetir o toque não duplica a lista.
    const [dup] = await db.select({ id: s.leads.id }).from(s.leads).where(and(eq(s.leads.kind, MOTO_LEAD_KIND), eq(s.leads.email, v.email)));
    if (!dup) {
      await db.insert(s.leads).values({ kind: MOTO_LEAD_KIND, name: v.name, email: v.email, phone: v.phone ?? undefined, city: "Ipatinga", message: MOTO_LEAD_MESSAGE, consent: true });
      publish(STAFF_CHANNEL, "lead");
    }
    return { ok: true };
  }
  if (what === "identity") {
    const v = await body(req, identitySchema);
    if (v.official) {
      if (!user || !can(user.role, "settings", "write")) throw new ApiError(403, "Só administradores definem a identidade oficial.");
      // Mesma regra do painel: a equipe só altera o site com a verificação em duas etapas ativa.
      if (staffMissingMfa(user)) throw new ApiError(403, "Para usar o painel, ative a verificação em duas etapas na sua conta.", "mfa_setup");
      await db.insert(s.settings).values({ key: "identity", value: v.identity }).onConflictDoUpdate({ target: s.settings.key, set: { value: v.identity } });
      await audit(user.id, "identity.set", "settings", "identity", { identity: v.identity });
      (await cookies()).delete("prumo_identity_preview");
    } else {
      (await cookies()).set("prumo_identity_preview", v.identity, { path: "/", sameSite: "lax", maxAge: 60 * 60 * 24 * 30 });
    }
    return { ok: true };
  }
  throw new ApiError(404, "Ação desconhecida.");
});
