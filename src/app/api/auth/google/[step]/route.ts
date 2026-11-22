import { randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { z } from "zod";
import { getDb, schema as s } from "@/database";
import { ApiError, audit, body, publicRoute } from "@/backend/api";
import { authSecret, checkRateLimit, cpfScan, cpfTaken, hashPassword, publicUser, revokeSessions, startSession } from "@/backend/auth";
import { clientIp } from "@/backend/security";
import { finishLogin, googleEnabled, seal, startParams, unseal, type GoogleProfile } from "@/backend/google";
import { isFullName, isValidCpf } from "@/shared/validation";
import { cpfTakenMessage } from "@/shared/account";
import { isRealProduction } from "@/shared/runtime-config";

const FLOW = "prumo_google_flow";
const PENDING = "prumo_google_new";
const HOME: Record<string, string> = { passenger: "/passageiro", driver: "/motorista", admin: "/admin", gestor: "/admin", atendente: "/admin" };
const STAFF = new Set(["admin", "gestor", "atendente"]);
const cookieOpts = (maxAge: number) => ({ httpOnly: true, sameSite: "lax" as const, secure: isRealProduction(process.env), path: "/", maxAge });

type Flow = { state: string; nonce: string; verifier: string; perfil?: string };

const completeSchema = z.object({
  name: z.string().trim().max(80, "O nome pode ter até 80 caracteres.").refine(isFullName, "Informe nome e sobrenome."),
  // Só dígitos. Toda conta nasce passageiro: um "role" no corpo é ignorado.
  cpf: z.string({ error: "Informe o CPF." }).transform((v) => v.replace(/\D/g, "")).refine(isValidCpf, "CPF inválido. Confira os números."),
  acceptPrivacy: z.literal(true, { error: "Aceite os termos e a política de privacidade para continuar." }),
});

/** Quem veio pelo "Seja motorista" do site entra como passageiro e segue para a página de virar motorista. */
const DRIVE = "/passageiro/dirigir";
const homeFor = (role: string, perfil?: string) => (perfil === "motorista" && role === "passenger" ? DRIVE : HOME[role]);

/** Volta para a tela de entrada com um motivo que ela sabe explicar, sem perder o perfil pedido (?perfil=motorista). */
const back = (req: Request, reason: string, perfil?: string | null) =>
  NextResponse.redirect(new URL(`/entrar?google=${reason}${perfil ? `&perfil=${encodeURIComponent(perfil)}` : ""}`, req.url), 303);

export const GET = publicRoute<{ step: string }>(async ({ req, params }) => {
  const jar = await cookies();

  if (params.step === "status") {
    const pending = await unseal<GoogleProfile>(jar.get(PENDING)?.value, authSecret(), "google-new");
    return { enabled: googleEnabled(), pending: pending ? { name: pending.name, email: pending.email } : null };
  }
  // No início o perfil vem da URL; no retorno do Google, do cookie do fluxo.
  const urlPerfil = new URL(req.url).searchParams.get("perfil") ?? undefined;
  if (!googleEnabled()) return back(req, "indisponivel", urlPerfil);

  if (params.step === "start") {
    if (!checkRateLimit(`google:${clientIp(req)}`, 30)) return back(req, "limite", urlPerfil);
    const p = startParams(req.url);
    const perfil = urlPerfil;
    jar.set(FLOW, await seal({ state: p.state, nonce: p.nonce, verifier: p.verifier, perfil }, authSecret(), 10, "google-flow"), cookieOpts(600));
    return NextResponse.redirect(p.url, 303);
  }

  if (params.step === "callback") {
    const url = new URL(req.url);
    const flow = await unseal<Flow>(jar.get(FLOW)?.value, authSecret(), "google-flow");
    jar.delete(FLOW);
    if (url.searchParams.get("error")) return back(req, "cancelado", flow?.perfil);
    const code = url.searchParams.get("code");
    if (!flow || !code || url.searchParams.get("state") !== flow.state) return back(req, "expirado", flow?.perfil);
    let profile: GoogleProfile;
    try { profile = await finishLogin(req.url, code, flow.verifier, flow.nonce); }
    catch (e) { console.error("[google]", e); return back(req, "falhou", flow.perfil); }

    const db = await getDb();
    let [user] = await db.select().from(s.users).where(eq(s.users.googleSub, profile.sub));
    if (!user) {
      // Mesmo e-mail de uma conta existente: o Google confirmou que a pessoa é dona dele, então a conta é vinculada.
      const [byEmail] = await db.select().from(s.users).where(eq(s.users.email, profile.email));
      if (byEmail) {
        // Contas da equipe entram só com senha: o painel não fica a um clique de uma conta Google.
        if (STAFF.has(byEmail.role)) return back(req, "equipe", flow.perfil);
        if (byEmail.status !== "active") return back(req, "conta-inativa", flow.perfil);
        // E-mail ainda não confirmado: quem criou a conta pode não ser o dono do endereço (pré-sequestro).
        // Só vincula se a conta já provou o e-mail; senão a pessoa entra com a senha e confirma primeiro.
        if (!byEmail.emailVerifiedAt) return back(req, "email-nao-confirmado", flow.perfil);
        [user] = await db.update(s.users).set({ googleSub: profile.sub }).where(eq(s.users.id, byEmail.id)).returning();
        // Quem estava conectado antes do vínculo sai de todos os aparelhos.
        await revokeSessions(user.id);
        await audit(user.id, "google.link", "user", user.id);
      }
    }
    if (user) {
      if (user.status !== "active") return back(req, "conta-inativa", flow.perfil);
      if (STAFF.has(user.role)) return back(req, "equipe", flow.perfil);
      await startSession(user.id);
      await audit(user.id, "google.login", "user", user.id);
      // Com verificação em duas etapas, o Google não basta: falta o código do aplicativo autenticador.
      if (user.totpEnabledAt) return NextResponse.redirect(new URL(`/entrar?etapa=codigo${flow.perfil ? `&perfil=${encodeURIComponent(flow.perfil)}` : ""}`, req.url), 303);
      return NextResponse.redirect(new URL(homeFor(user.role, flow.perfil), req.url), 303);
    }
    // Conta nova: faltam o nome, o CPF e o aceite dos termos. O perfil do Google espera num cookie assinado.
    jar.set(PENDING, await seal(profile, authSecret(), 15, "google-new"), cookieOpts(900));
    return NextResponse.redirect(new URL(`/entrar?google=novo${flow.perfil ? `&perfil=${encodeURIComponent(flow.perfil)}` : ""}`, req.url), 303);
  }
  throw new ApiError(404, "Recurso não encontrado.");
});

export const POST = publicRoute<{ step: string }>(async ({ req, params }) => {
  if (params.step !== "complete") throw new ApiError(404, "Recurso não encontrado.");
  const jar = await cookies();
  const profile = await unseal<GoogleProfile>(jar.get(PENDING)?.value, authSecret(), "google-new");
  if (!profile) throw new ApiError(400, "O tempo para concluir passou. Toque em Continuar com Google de novo.");
  // Limite por conta Google e por endereço: o cookie pendente vale 15 min e não pode servir para testar CPFs em série.
  if (!checkRateLimit(`google-complete:${profile.sub}`, 5) || !checkRateLimit(`register:${clientIp(req)}`, 20)) {
    throw new ApiError(429, "Muitas tentativas. Aguarde alguns minutos.");
  }
  const v = await body(req, completeSchema);
  const db = await getDb();
  const [clash] = await db.select({ id: s.users.id }).from(s.users).where(eq(s.users.email, profile.email));
  if (clash) throw new ApiError(409, "Já existe uma conta com este e-mail. Entre por ela.");
  const scan = cpfScan(clientIp(req));
  if (scan === "limited") throw new ApiError(429, "Muitas tentativas. Aguarde alguns minutos.");
  if (await cpfTaken(v.cpf)) throw new ApiError(409, cpfTakenMessage(scan));
  const [user] = await db.insert(s.users).values({
    name: v.name, email: profile.email, cpf: v.cpf, googleSub: profile.sub, emailVerifiedAt: new Date(), role: "passenger", privacyAcceptedAt: new Date(),
    // Sem senha escolhida: um valor aleatório. Se quiser entrar com senha, a pessoa cria pelo "Esqueci minha senha".
    passwordHash: await hashPassword(randomBytes(32).toString("hex")),
  }).returning();
  jar.delete(PENDING);
  await audit(user.id, "register", "user", user.id, { role: "passenger", via: "google" });
  await startSession(user.id);
  return publicUser(user);
});
