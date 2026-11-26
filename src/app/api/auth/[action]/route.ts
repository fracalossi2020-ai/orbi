import { and, desc, eq, isNull, ne, or } from "drizzle-orm";
import { z } from "zod";
import { getDb, schema as s } from "@/database";
import { ApiError, audit, body, publicRoute } from "@/backend/api";
import { authSecret, checkRateLimit, CPF_LOOKUP_GLOBAL, cpfScan, identifierHash, cpfTaken, decryptTotp, encryptTotp, endSession, hashPassword, mfaPending, publicUser, readSession, revokeSessions, startSession, verifyPassword } from "@/backend/auth";
import { clientIp, findRecovery, newRecoveryCodes, newTotpSecret, otpauthUrl, passwordProblem, verifyTotp } from "@/backend/security";
import { rateLimitDb, rateLimitDbDetail, resetLimitDb } from "@/backend/rate-limit-db";
import { clearFailures, countLoginFailure, failureDelay, floodDelay, onLocked, recordFailure } from "@/backend/login-guard";
import { alertAdmins, mailOwner, notifyLogin, previousAccesses } from "@/backend/access";
import { hashInviteToken } from "@/backend/invites";
import { dailyCap, looksLikeBot } from "@/backend/bot-guard";
import { adminAllowList, ipAllowed } from "@/shared/ip-allow";
import { rawClientIp } from "@/shared/client-ip";
import { inviteUsable } from "@/shared/invite";
import { isLocked, MFA_OVERFLOW_LIMIT } from "@/shared/lockout";
import { maskIp } from "@/shared/sessions";
import { sendCode, useCode } from "@/backend/codes";
import { maskEmail } from "@/backend/mail";
import { emailDomainExists } from "@/backend/verify";
import { isFullName, isValidCpf, isValidEmailFormat, isValidMobile } from "@/shared/validation";
import { cpfTakenMessage, normalizeIdentifier } from "@/shared/account";
import { STAFF } from "@/shared/permissions";
import { currentScope } from "@/backend/host";

const digits = (v: string) => v.replace(/\D/g, "");
/** CPF guardado só com os dígitos. */
const cpfField = z.string({ error: "Informe o CPF." }).transform(digits).refine(isValidCpf, "CPF inválido. Confira os números.");
const MOBILE_ERROR = "Celular inválido: use DDD e número com 9 na frente.";
const EMAIL_DOMAIN_ERROR = "Este e-mail não pode receber mensagens. Confira o que vem depois do @.";
const password = z.string().min(8, "A senha precisa de pelo menos 8 caracteres.").max(128, "A senha pode ter até 128 caracteres.");
const mfaSchema = z.object({ code: z.string().trim().min(6).max(20) });
const changeSchema = z.object({ current: z.string().min(1, "Informe a senha atual."), password });
const registerSchema = z.object({
  name: z.string().trim().max(80, "O nome pode ter até 80 caracteres.").refine(isFullName, "Informe nome e sobrenome."),
  email: z.string().trim().toLowerCase().email("E-mail inválido.").optional().or(z.literal("")),
  phone: z.string().transform(digits).refine((v) => v.length === 0 || isValidMobile(v), MOBILE_ERROR).optional(),
  password,
  cpf: cpfField,
  // Toda conta nasce passageiro: virar motorista é um passo dentro da conta (/passageiro/dirigir). Um "role" no corpo é ignorado.
  acceptPrivacy: z.literal(true, { error: "Aceite os termos e a política de privacidade para continuar." }),
  // Defesa contra robôs (campo-isca escondido e carimbo de tempo da página): veja shared/bot-guard.ts.
  website: z.string().max(200).optional(), stamp: z.string().max(200).optional(),
}).refine((v) => v.email || v.phone, { message: "Informe e-mail ou telefone." });

const RESET_MESSAGE = "Se existir uma conta com esse dado, enviamos o código.";
const INVITE_ACTIONS = ["invite-info", "invite-start", "invite-finish"];
const inviteTokenSchema = z.object({ token: z.string().trim().min(20).max(100) });
const inviteStartSchema = inviteTokenSchema.extend({ password: z.string().min(10, "A senha precisa de pelo menos 10 caracteres.").max(128, "A senha pode ter até 128 caracteres.") });
const inviteFinishSchema = inviteTokenSchema.extend({ code: z.string().trim().regex(/^\d{6}$/, "Digite os 6 números do aplicativo.") });

const identifierSchema = z.string().trim().min(3, "Informe e-mail ou telefone.");
const lookupSchema = z.object({ identifier: identifierSchema });
/** Consulta por e-mail/telefone ({ identifier }) ou por CPF ({ cpf }). */
const lookupAnySchema = z.object({ identifier: z.string().optional(), cpf: z.string().optional() });
const loginSchema = z.object({ identifier: identifierSchema, password: z.string().min(1, "Informe a senha."), remember: z.boolean().optional() });
const resetConfirmSchema = z.object({ identifier: identifierSchema, code: z.string().trim(), password });
const emailSendSchema = z.object({ email: z.string().trim().toLowerCase().email("E-mail inválido.").optional(), password: z.string().max(128).optional() });
const codeSchema = z.object({ code: z.string().trim() });

/** E-mail só compara com e-mail: um endereço como 31999998888@x.com não pode achar a conta desse telefone. */
const identifierMatch = (raw: string) => {
  const key = normalizeIdentifier(raw);
  return key.includes("@") ? eq(s.users.email, key) : eq(s.users.phone, digits(key) || "-");
};

export const POST = publicRoute<{ action: string }>(async ({ req, user: session, params }) => {
  const db = await getDb();
  const ip = clientIp(req);
  // Modo separado: no painel só entram login, segunda etapa, troca de senha e saída; no app, a equipe não entra nem recupera senha.
  const scope = await currentScope();
  if (scope === "admin" && !["login", "mfa", "password-change", "logout", ...INVITE_ACTIONS].includes(params.action)) throw new ApiError(404, "Ação desconhecida.");
  // O convite da equipe só existe no painel (ou no modo de um host só).
  if (scope === "app" && INVITE_ACTIONS.includes(params.action)) throw new ApiError(404, "Ação desconhecida.");
  const findActive = async (identifier: string) => {
    const [u] = await db.select().from(s.users).where(identifierMatch(identifier));
    return u && u.status === "active" && !(scope === "app" && STAFF.includes(u.role)) ? u : null;
  };

  if (params.action === "register") {
    if (!(await rateLimitDb(`register:${ip}`, 20))) throw new ApiError(429, "Muitas tentativas. Aguarde alguns minutos.");
    const v = await body(req, registerSchema);
    // Robô: responde que deu certo e não cria nada.
    if (looksLikeBot({ website: v.website, stamp: v.stamp })) return { ok: true };
    const email = v.email || null;
    if (email && !(await emailDomainExists(email))) throw new ApiError(400, EMAIL_DOMAIN_ERROR);
    const phone = v.phone || null;
    const weak = passwordProblem(v.password, [v.name.split(" ")[0], email, phone]);
    if (weak) throw new ApiError(400, weak);
    const clash = await db.select({ id: s.users.id }).from(s.users).where(or(email ? eq(s.users.email, email) : undefined, phone ? eq(s.users.phone, phone) : undefined));
    if (clash.length) throw new ApiError(409, "Já existe uma conta com este e-mail ou telefone.");
    // O CPF tem limite próprio e apertado: a resposta diz se o número tem conta (dado pessoal).
    const scan = await cpfScan(ip);
    if (scan === "limited") throw new ApiError(429, "Muitas tentativas. Aguarde alguns minutos.");
    if (await cpfTaken(v.cpf)) throw new ApiError(409, cpfTakenMessage(scan));
    await dailyCap("register");
    const [user] = await db.insert(s.users).values({
      name: v.name, email, phone, cpf: v.cpf, role: "passenger", passwordHash: await hashPassword(v.password), privacyAcceptedAt: new Date(),
    }).returning();
    await audit(user.id, "register", "user", user.id, { role: "passenger" });
    await startSession(user.id);
    // A conta já funciona; o código de confirmação chega por e-mail. Falha no envio não impede o cadastro.
    if (email) await sendCode(user, email, "email_verify").catch(() => undefined);
    return publicUser(user);
  }

  // Informa se a conta existe, como o cadastro já faz ao recusar duplicados: o limite por endereço restringe varreduras.
  if (params.action === "lookup") {
    if (!(await rateLimitDb(`lookup:${ip}`, 30))) throw new ApiError(429, "Muitas tentativas. Aguarde alguns minutos.");
    const raw = await body(req, lookupAnySchema);
    // CPF: avisa no cadastro, antes de chegar à senha, que ele já está em outra conta. É só um aviso antecipado
    // (o cadastro confere de novo): passado o limite, responde "não existe" sem consultar, para não servir de
    // varredura de listas de CPFs, nem por um endereço só nem trocando de endereço (limite geral).
    if (raw.cpf !== undefined && raw.identifier === undefined) {
      const cpf = cpfField.parse(raw.cpf);
      if ((await cpfScan(ip)) !== "ok") return { exists: false };
      return { exists: await cpfTaken(cpf) };
    }
    const v = lookupSchema.parse(raw);
    // Cada e-mail ou celular só pode ser consultado 5 vezes por hora, e o servidor todo tem um teto (o mesmo do CPF):
    // passado qualquer um, responde "não existe" sem consultar, para não servir de varredura de contas.
    const byId = await rateLimitDb(`lookup:id:${identifierHash(normalizeIdentifier(v.identifier))}`, 5, 60 * 60_000);
    const overall = await rateLimitDb("lookup:all", CPF_LOOKUP_GLOBAL);
    if (!byId || !overall) return { exists: false };
    const [user] = await db.select({ id: s.users.id }).from(s.users).where(identifierMatch(v.identifier));
    if (user) return { exists: true };
    // Conta nova: avisa do erro de digitação logo aqui, antes das outras perguntas.
    const key = normalizeIdentifier(v.identifier);
    if (key.includes("@")) {
      if (!isValidEmailFormat(key)) throw new ApiError(400, "E-mail inválido.");
      if (!(await emailDomainExists(key))) throw new ApiError(400, EMAIL_DOMAIN_ERROR);
    } else if (!isValidMobile(key)) throw new ApiError(400, MOBILE_ERROR);
    return { exists: false };
  }

  if (params.action === "login") {
    const v = await body(req, loginSchema);
    const key = normalizeIdentifier(v.identifier);
    // Onda de falhas no servidor todo: todo login espera 2 s (e a equipe foi avisada).
    await floodDelay();
    // Limites no banco: por texto digitado, por IP (quem testa muitas contas) e por conta (quem troca de IP e de grafia não ganha tentativas a mais).
    const typed = await rateLimitDbDetail(`login:acct:${key}`, 12);
    const byIp = await rateLimitDb(`login:ip:${ip}`, 40);
    const [user] = await db.select().from(s.users).where(identifierMatch(v.identifier));
    const byUid = user ? await rateLimitDb(`login:uid:${user.id}`, 12) : true;
    if (!typed.ok || !byIp || !byUid) throw new ApiError(429, "Muitas tentativas. Aguarde 15 minutos ou use \"Esqueci a senha\".");
    const generic = () => new ApiError(401, "E-mail, telefone ou senha incorretos.");
    const staffUser = !!user && STAFF.includes(user.role);

    // Conta bloqueada por tentativas erradas: 401 genérico sem olhar a senha (a conferência com senha falsa só iguala o tempo de resposta).
    if (user && isLocked(user.lockedUntil)) {
      await verifyPassword(v.password, null);
      throw generic();
    }
    // Lista de IPs do painel: a equipe de fora dela recebe o mesmo 401 de uma senha errada. Não conta como falha da conta
    // (senão qualquer um bloquearia a equipe de fora), mas fica na auditoria e avisa os administradores.
    if (user && staffUser && !ipAllowed(adminAllowList(), rawClientIp(req.headers))) {
      await verifyPassword(v.password, null);
      await audit(user.id, "staff.login_failed", "user", user.id, { reason: "ip fora da lista" });
      await alertAdmins("Tentativa de entrar no painel de fora da lista de IPs", `Alguém tentou entrar no painel com a conta de ${user.name} de um endereço que não está em ADMIN_ALLOWED_IPS (rede ${maskIp(rawClientIp(req.headers)) ?? "desconhecida"}). O acesso foi recusado.`, { key: `ip-out:${user.id}`, windowMs: 60 * 60_000 });
      throw generic();
    }

    // A senha é conferida mesmo sem conta (contra uma senha falsa): o tempo de resposta não revela se a conta existe.
    const ok = await verifyPassword(v.password, user?.passwordHash);
    // No painel, quem não é da equipe recebe a mesma resposta de senha errada: nada revela que a conta existe.
    const outOfPanel = scope === "admin" && !!user && !STAFF.includes(user.role);
    if (!user || user.status !== "active" || !ok || outOfPanel) {
      // Só senha errada em conta existente e ativa conta para o bloqueio. Sem conta: o atraso segue a contagem do texto digitado,
      // para o tempo da resposta ser parecido e não revelar se a conta existe (e sem linha na auditoria).
      let n = typed.n;
      if (user && user.status === "active" && !ok) {
        const f = await recordFailure(user.id);
        n = f.n;
        await audit(user.id, staffUser ? "staff.login_failed" : "login.failed", "user", user.id, { reason: "senha", failures: f.n });
        if (f.lockMs) await onLocked(user, f.n, f.lockMs);
      } else if (user) {
        await audit(user.id, staffUser ? "staff.login_failed" : "login.failed", "user", user.id, { reason: user.status !== "active" ? "conta inativa" : "fora do painel" });
      }
      await countLoginFailure();
      await failureDelay(n);
      throw generic();
    }
    // No app, a equipe usa o painel (a senha já estava certa, então dizer onde entrar não revela nada).
    if (scope === "app" && STAFF.includes(user.role)) {
      await audit(user.id, "login.failed", "user", user.id, { reason: "equipe no app" });
      throw new ApiError(403, "Contas da equipe entram pelo painel. Use o endereço do painel da equipe.");
    }
    await Promise.all([resetLimitDb(`login:acct:${key}`), resetLimitDb(`login:uid:${user.id}`)]);
    if (user.failedLogins || user.lockedUntil) await clearFailures(user.id);
    const known = await previousAccesses(user.id);
    await audit(user.id, staffUser ? "staff.login" : "login", "user", user.id);
    await startSession(user.id, { remember: v.remember });
    // Aviso de acesso (aparelho novo; equipe: sempre). Sem esperar o envio do e-mail.
    void notifyLogin(user, known).catch((e) => console.error("[aviso de acesso]", (e as Error).message));
    // Com a verificação em duas etapas, a sessão só vale depois do código do aplicativo autenticador.
    if (user.totpEnabledAt) return { mfaRequired: true };
    return publicUser(user);
  }

  // Segunda etapa: código do aplicativo autenticador (ou um código de recuperação).
  if (params.action === "mfa") {
    const r = await readSession();
    if (!r || !mfaPending(r)) throw new ApiError(400, "Não há verificação pendente. Entre de novo.");
    const lim = await rateLimitDbDetail(`mfa:${r.user.id}`, 6);
    if (!lim.ok) {
      // A 1ª tentativa além do limite de uma janela conta como "janela estourada". Três seguidas (sem acerto no meio)
      // derrubam a sessão pendente e avisam o dono: alguém com a senha está insistindo no código.
      if (lim.n === 7 && (await rateLimitDbDetail(`mfa-over:${r.user.id}`, 1000, 24 * 60 * 60_000)).n >= MFA_OVERFLOW_LIMIT) {
        await db.update(s.sessions).set({ revokedAt: new Date() }).where(eq(s.sessions.id, r.session.id));
        await audit(r.user.id, STAFF.includes(r.user.role) ? "staff.mfa_failed" : "mfa.failed", "user", r.user.id, { reason: "janelas estouradas", sessionRevoked: true });
        await mailOwner(r.user, "Tentativas de código na sua conta Orbi", "Alguém que sabe a sua senha tentou o código da verificação em duas etapas várias vezes sem acertar, e a tentativa foi encerrada.\n\nTroque a senha agora em \"Esqueci a senha\".", { key: "mfa-over", windowMs: 24 * 60 * 60_000 });
        if (STAFF.includes(r.user.role)) await alertAdmins(`Insistência no código da conta da equipe: ${r.user.name}`, `A conta da equipe de ${r.user.name} teve a senha aceita, mas errou o código da segunda etapa em 3 janelas seguidas. A sessão pendente foi encerrada.`, { key: `mfa-over:${r.user.id}`, windowMs: 60 * 60_000 });
        await resetLimitDb(`mfa-over:${r.user.id}`);
      }
      throw new ApiError(429, "Muitas tentativas. Aguarde 15 minutos.");
    }
    const v = await body(req, mfaSchema);
    const code = v.code.replace(/\s/g, "");
    let accepted = false;
    if (/^\d{6}$/.test(code) && r.user.totpSecret) {
      const step = verifyTotp(decryptTotp(r.user.totpSecret), code, r.user.totpLastStep);
      if (step !== null) { accepted = true; await db.update(s.users).set({ totpLastStep: step }).where(eq(s.users.id, r.user.id)); }
    } else {
      // Código de recuperação: vale uma única vez.
      const left = r.user.recoveryCodes ?? [];
      const h = findRecovery(code, left, authSecret());
      if (h) {
        accepted = true;
        await db.update(s.users).set({ recoveryCodes: left.filter((x) => x !== h) }).where(eq(s.users.id, r.user.id));
        await audit(r.user.id, "mfa.recovery_used", "user", r.user.id, { left: left.length - 1 });
      }
    }
    if (!accepted) {
      await audit(r.user.id, STAFF.includes(r.user.role) ? "staff.mfa_failed" : "mfa.failed", "user", r.user.id);
      throw new ApiError(400, "Código incorreto. Confira o aplicativo autenticador e tente de novo.");
    }
    await Promise.all([resetLimitDb(`mfa:${r.user.id}`), resetLimitDb(`mfa-over:${r.user.id}`)]);
    await db.update(s.sessions).set({ mfaAt: new Date() }).where(eq(s.sessions.id, r.session.id));
    await audit(r.user.id, "mfa.ok", "user", r.user.id);
    return publicUser(r.user);
  }

  // Troca de senha com a sessão aberta: pede a senha atual e encerra os outros aparelhos.
  if (params.action === "password-change") {
    const r = await readSession();
    if (!r || mfaPending(r)) throw new ApiError(401, "Entre na sua conta para continuar.");
    if (!checkRateLimit(`pwchange:${r.user.id}`, 5)) throw new ApiError(429, "Muitas tentativas. Aguarde 15 minutos.");
    const v = await body(req, changeSchema);
    if (!(await verifyPassword(v.current, r.user.passwordHash))) throw new ApiError(400, "A senha atual não confere.");
    const weak = passwordProblem(v.password, [r.user.name.split(" ")[0], r.user.email, r.user.phone]);
    if (weak) throw new ApiError(400, weak);
    await db.update(s.users).set({ passwordHash: await hashPassword(v.password) }).where(eq(s.users.id, r.user.id));
    await revokeSessions(r.user.id, r.session.id);
    await audit(r.user.id, "password.change", "user", r.user.id);
    return { ok: true };
  }

  // Esqueci a senha: o código vai para o e-mail da conta, nunca para um endereço informado agora.
  if (params.action === "reset-request") {
    if (!(await rateLimitDb(`reset:${ip}`, 10, 60 * 60_000))) throw new ApiError(429, "Muitas tentativas. Aguarde uma hora.");
    const v = await body(req, lookupSchema);
    // Sempre a mesma resposta (200), exista a conta ou não, tenha ela e-mail ou não: nada revela se o dado tem conta.
    const user = await findActive(v.identifier);
    if (user?.email) {
      await sendCode(user, user.email, "password_reset");
      await audit(user.id, "password.reset_request", "user", user.id);
    }
    return { ok: true, message: RESET_MESSAGE };
  }

  if (params.action === "reset-confirm") {
    const v = await body(req, resetConfirmSchema);
    if (!(await rateLimitDb(`reset-confirm:${ip}`, 20))) throw new ApiError(429, "Muitas tentativas. Aguarde 15 minutos.");
    const user = await findActive(v.identifier);
    if (!user) throw new ApiError(404, "Não encontramos uma conta com esse dado.");
    // Limite por conta: quem troca de IP não ganha mais tentativas de adivinhar o código.
    if (!(await rateLimitDb(`reset-confirm:uid:${user.id}`, 10, 60 * 60_000))) throw new ApiError(429, "Muitas tentativas. Aguarde uma hora.");
    const weak = passwordProblem(v.password, [user.name.split(" ")[0], user.email, user.phone]);
    if (weak) throw new ApiError(400, weak);
    await useCode(user.id, "password_reset", v.code);
    // Receber o código prova que a pessoa controla o e-mail.
    const [updated] = await db.update(s.users).set({ passwordHash: await hashPassword(v.password), emailVerifiedAt: user.emailVerifiedAt ?? new Date() })
      .where(eq(s.users.id, user.id)).returning();
    // Senha nova: quem estava conectado com a antiga (inclusive um invasor) sai de todos os aparelhos.
    await revokeSessions(user.id);
    // Esqueci a senha funciona com a conta bloqueada e a desbloqueia: o dono provou o e-mail.
    await clearFailures(user.id);
    await Promise.all([resetLimitDb(`login:uid:${user.id}`), resetLimitDb(`login:acct:${normalizeIdentifier(v.identifier)}`)]);
    await audit(user.id, "password.reset", "user", user.id);
    await startSession(user.id);
    // O e-mail não substitui o aplicativo autenticador: com duas etapas ativas, o código ainda é pedido.
    if (updated.totpEnabledAt) return { mfaRequired: true };
    return publicUser(updated);
  }

  if (params.action === "email-send" || params.action === "email-confirm") {
    if (!session) throw new ApiError(401, "Entre na sua conta para continuar.");
    // Conta do Google não tem senha escolhida (a guardada é aleatória), então não há senha para pedir. Nela, quem
    // prova ser o dono é o e-mail ATUAL: ele recebe um código antes de o endereço novo ser aceito (e depois o novo recebe o seu).
    const viaCurrent = Boolean(session.googleSub);
    // Etapa do código do e-mail atual: o último pedido dele e se já foi usado (usar vale 30 min para concluir a troca).
    const currentStage = async () => {
      const [row] = await db.select().from(s.verificationCodes)
        .where(and(eq(s.verificationCodes.userId, session.id), eq(s.verificationCodes.purpose, "email_change_old")))
        .orderBy(desc(s.verificationCodes.createdAt)).limit(1);
      return row?.usedAt && Date.now() - row.usedAt.getTime() < 30 * 60_000 ? "done" as const : "pending" as const;
    };
    const clearCurrent = () => db.delete(s.verificationCodes).where(and(eq(s.verificationCodes.userId, session.id), eq(s.verificationCodes.purpose, "email_change_old")));

    if (params.action === "email-confirm") {
      const v = await body(req, codeSchema);
      const target = session.pendingEmail ?? session.email;
      if (!target) throw new ApiError(409, "Cadastre um e-mail primeiro.");
      if (session.pendingEmail && viaCurrent && (await currentStage()) !== "done") {
        // Primeira etapa: o código do e-mail atual autoriza a troca; só então o endereço novo recebe o dele.
        await useCode(session.id, "email_change_old", v.code);
        await sendCode(session, session.pendingEmail, "email_verify");
        return { ok: true, next: "new", sentTo: maskEmail(session.pendingEmail) };
      }
      await useCode(session.id, "email_verify", v.code);
      if (session.pendingEmail) {
        // Só agora o e-mail novo passa a ser o da conta (e o canal de recuperação de senha).
        const [other] = await db.select({ id: s.users.id }).from(s.users).where(and(eq(s.users.email, session.pendingEmail), ne(s.users.id, session.id)));
        if (other) throw new ApiError(409, "Este e-mail já está em outra conta.");
        await db.update(s.users).set({ email: session.pendingEmail, pendingEmail: null, emailVerifiedAt: new Date() }).where(eq(s.users.id, session.id));
        await clearCurrent();
        await audit(session.id, "email.change", "user", session.id);
      } else {
        await db.update(s.users).set({ emailVerifiedAt: new Date() }).where(eq(s.users.id, session.id));
      }
      await audit(session.id, "email.verified", "user", session.id);
      return { ok: true };
    }
    const v = await body(req, emailSendSchema);
    // Sem endereço novo: reenvia para o que está pendente ou, não havendo, para o e-mail atual (primeira confirmação).
    let email = session.pendingEmail ?? session.email;
    // Endereço novo: fica pendente até o código ser confirmado, pede a senha atual e não pode pertencer a outra conta.
    if (v.email && v.email !== session.email) {
      if (!checkRateLimit(`emailchange:${session.id}`, 5)) throw new ApiError(429, "Muitas tentativas. Aguarde 15 minutos.");
      if (viaCurrent) {
        if (!session.email || !session.emailVerifiedAt) throw new ApiError(409, "Confirme seu e-mail atual antes de trocar por outro.");
      } else {
        if (!v.password) throw new ApiError(400, "Informe sua senha atual para trocar o e-mail.");
        if (!(await verifyPassword(v.password, session.passwordHash))) throw new ApiError(400, "A senha atual não confere.");
      }
      if (!(await emailDomainExists(v.email))) throw new ApiError(400, EMAIL_DOMAIN_ERROR);
      const [other] = await db.select({ id: s.users.id }).from(s.users).where(and(eq(s.users.email, v.email), ne(s.users.id, session.id)));
      if (other) throw new ApiError(409, "Este e-mail já está em outra conta.");
      // Troca nova começa do zero: autorização do e-mail atual de uma troca anterior não vale para este endereço.
      await clearCurrent();
      await db.update(s.users).set({ pendingEmail: v.email }).where(eq(s.users.id, session.id));
      await audit(session.id, "email.change_request", "user", session.id);
      email = v.email;
      if (viaCurrent) {
        await sendCode(session, session.email!, "email_change_old");
        return { sentTo: maskEmail(session.email!), step: "current" };
      }
    } else if (v.email && session.pendingEmail) {
      // Voltou ao e-mail atual: descarta a troca pendente.
      await db.update(s.users).set({ pendingEmail: null }).where(eq(s.users.id, session.id));
      await clearCurrent();
      email = session.email;
    } else if (viaCurrent && session.pendingEmail && session.email && (await currentStage()) !== "done") {
      // Reenvio ainda na primeira etapa: o código continua indo para o e-mail atual, nunca direto para o novo.
      await sendCode(session, session.email, "email_change_old");
      return { sentTo: maskEmail(session.email), step: "current" };
    }
    if (!email) throw new ApiError(400, "Informe o e-mail.");
    await sendCode(session, email, "email_verify");
    return { sentTo: maskEmail(email), ...(viaCurrent && session.pendingEmail ? { step: "new" } : {}) };
  }

  // Convite da equipe (token de uso único enviado por e-mail): a pessoa define a senha e ativa a segunda etapa.
  if (INVITE_ACTIONS.includes(params.action)) {
    if (!(await rateLimitDb(`invite:${ip}`, 30))) throw new ApiError(429, "Muitas tentativas. Aguarde alguns minutos.");
    // O corpo só pode ser lido uma vez: lê tudo aqui e confere os campos de cada etapa abaixo.
    const raw = await body(req, inviteTokenSchema.extend({ password: z.string().optional(), code: z.string().optional() }));
    const tokenHash = hashInviteToken(raw.token);
    const [row] = await db.select({ inv: s.staffInvites, u: s.users }).from(s.staffInvites).innerJoin(s.users, eq(s.staffInvites.userId, s.users.id)).where(eq(s.staffInvites.tokenHash, tokenHash));
    const invalid = () => new ApiError(410, "Este convite não vale mais. Peça um novo a um administrador.");
    if (!row || !inviteUsable(row.inv) || row.u.status !== "active" || !STAFF.includes(row.u.role)) throw invalid();
    if (!(await rateLimitDb(`invite-token:${row.inv.id}`, 20, 60 * 60_000))) throw new ApiError(429, "Muitas tentativas. Aguarde uma hora.");
    if (params.action === "invite-info") return { name: row.u.name, email: row.u.email, role: row.u.role };

    if (params.action === "invite-start") {
      const v = inviteStartSchema.parse(raw);
      const weak = passwordProblem(v.password, [row.u.name.split(" ")[0], row.u.email]);
      if (weak) throw new ApiError(400, weak);
      const secret = newTotpSecret();
      await db.update(s.users).set({ passwordHash: await hashPassword(v.password), totpSecret: encryptTotp(secret), totpLastStep: null }).where(eq(s.users.id, row.u.id));
      return { secret, otpauth: otpauthUrl(secret, row.u.email ?? row.u.name) };
    }

    // invite-finish: confere o primeiro código do aplicativo, liga a segunda etapa e entra.
    const v = inviteFinishSchema.parse(raw);
    if (!row.u.totpSecret || row.u.totpEnabledAt) throw new ApiError(409, "Comece pela senha e pela leitura do QR Code.");
    const step = verifyTotp(decryptTotp(row.u.totpSecret), v.code, null);
    if (step === null) throw new ApiError(400, "Código incorreto. Confira se o relógio do celular está certo e tente de novo.");
    // Uso único: só quem marcar o convite como usado primeiro conclui.
    const [claimed] = await db.update(s.staffInvites).set({ usedAt: new Date() }).where(and(eq(s.staffInvites.id, row.inv.id), isNull(s.staffInvites.usedAt))).returning({ id: s.staffInvites.id });
    if (!claimed) throw invalid();
    const { codes, hashes } = newRecoveryCodes(authSecret());
    await db.update(s.users).set({ totpEnabledAt: new Date(), totpLastStep: step, recoveryCodes: hashes, emailVerifiedAt: row.u.emailVerifiedAt ?? new Date() }).where(eq(s.users.id, row.u.id));
    await revokeSessions(row.u.id);
    await audit(row.u.id, "staff.invite_accepted", "user", row.u.id, { role: row.u.role });
    await startSession(row.u.id, { mfa: true, remember: false });
    return { recoveryCodes: codes, role: row.u.role };
  }


  if (params.action === "logout") {
    await endSession();
    return { ok: true };
  }
  throw new ApiError(404, "Ação desconhecida.");
});
