"use client";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { Icon } from "@/frontend/components/Icon";
import { OrbiMark } from "@/frontend/components/OrbiMark";
import { api, ErrorNote, Note, ThemeToggle, useAction } from "@/frontend/components/ui";
import { skipNextSplash } from "@/frontend/lib/splash";
import { isReturning, markReturning } from "@/frontend/lib/visitor";
import { isFullName, isValidCpf, isValidEmailFormat, onlyDigits } from "@/shared/validation";

type Step = "welcome" | "identifier" | "password" | "reset" | "name" | "cpf" | "email" | "create" | "google" | "mfa";

// Por que o login com Google voltou para esta tela.
const GOOGLE_REASON: Record<string, string> = {
  cancelado: "Você cancelou a entrada com Google.",
  expirado: "A entrada com Google demorou demais. Tente de novo.",
  falhou: "O Google não confirmou sua conta. Tente de novo ou use celular e senha.",
  equipe: "Contas da equipe entram com e-mail e senha.",
  "conta-inativa": "Esta conta está suspensa ou foi excluída. Fale com o suporte.",
  "email-nao-confirmado": "Já existe uma conta com este e-mail. Entre com sua senha e confirme o e-mail para usar o Google.",
  indisponivel: "A entrada com Google ainda não está ativada.",
  limite: "Muitas tentativas. Aguarde alguns minutos.",
};

const GOOGLE_OFF = "A entrada com Google ainda não está ativada.";
const APPLE_SOON = "A entrada com Apple chega em breve.";
const CPF_WHY = "Pedimos o CPF para a segurança das viagens e para emitir seus recibos.";

/** O "G" do Google, como pedem as regras de marca deles para o botão de entrada. */
function GoogleG() {
  return (
    <svg width="20" height="20" viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
      <path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
    </svg>
  );
}

/** A maçã da Apple na cor do texto: preta no tema claro, branca no escuro. */
function AppleLogo() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12.152 6.896c-.948 0-2.415-1.078-3.96-1.04-2.04.027-3.91 1.183-4.961 3.014-2.117 3.675-.546 9.103 1.519 12.09 1.013 1.454 2.208 3.09 3.792 3.039 1.52-.065 2.09-.987 3.935-.987 1.831 0 2.35.987 3.96.948 1.637-.026 2.676-1.48 3.676-2.948 1.156-1.688 1.636-3.325 1.662-3.415-.039-.013-3.182-1.221-3.22-4.857-.026-3.04 2.48-4.494 2.597-4.559-1.429-2.09-3.623-2.324-4.39-2.376-2-.156-3.675 1.09-4.61 1.09zM15.53 3.83c.843-1.012 1.4-2.427 1.245-3.83-1.207.052-2.662.805-3.532 1.818-.78.896-1.454 2.338-1.273 3.714 1.338.104 2.715-.688 3.559-1.701" />
    </svg>
  );
}

// Botões "ou continue com": Google funciona (com GOOGLE_CLIENT_ID e GOOGLE_CLIENT_SECRET); Apple avisa que chega em breve.
const SOCIAL_LOGIN = true;

const HOME: Record<string, string> = { passenger: "/passageiro", driver: "/motorista", admin: "/admin", gestor: "/admin", atendente: "/admin" };

/** Aceita 031, +55 e colagens com pontuação; guarda só DDD e número. */
function phoneDigits(value: string) {
  let d = value.replace(/\D/g, "").replace(/^0+/, "");
  if (d.length > 11 && d.startsWith("55")) d = d.slice(2);
  return d.slice(0, 11);
}

function maskPhone(d: string) {
  if (d.length <= 2) return d && `(${d}`;
  const split = d.length === 11 ? 7 : 6;
  return d.length <= split ? `(${d.slice(0, 2)}) ${d.slice(2)}` : `(${d.slice(0, 2)}) ${d.slice(2, split)}-${d.slice(split)}`;
}

/** 000.000.000-00, montado aos poucos enquanto a pessoa digita. */
function maskCpf(d: string) {
  return [d.slice(0, 3), d.slice(3, 6), d.slice(6, 9)].filter(Boolean).join(".") + (d.length > 9 ? `-${d.slice(9, 11)}` : "");
}


/** Celular ou e-mail no mesmo campo: com "@" ou letras é e-mail; só números, é celular (com DDD). */
function parseWho(v: string): { email: boolean; id: string } | null {
  const t = v.trim();
  if (/[@a-z]/i.test(t)) return /@/.test(t) ? { email: true, id: t.toLowerCase() } : null;
  const d = phoneDigits(t);
  return d.length >= 10 ? { email: false, id: d } : null;
}

/** Progresso discreto do cadastro: um traço por tela. */
function Progress({ at, total }: { at: number; total: number }) {
  return (
    <div className="mb-6 flex gap-1.5" role="progressbar" aria-label="Progresso do cadastro" aria-valuemin={1} aria-valuemax={total} aria-valuenow={at} aria-valuetext={`Etapa ${at} de ${total}`}>
      {Array.from({ length: total }, (_, i) => <span key={i} className={`h-1 flex-1 rounded-full transition-colors ${i < at ? "bg-primary" : "bg-line"}`} />)}
    </div>
  );
}

function Flow() {
  const params = useSearchParams();
  const perfil = params.get("perfil");
  const forDriver = perfil === "motorista";
  const etapa = params.get("etapa");

  // Vindo do Google com verificação em duas etapas ativa: abre direto no código.
  // Links diretos: ?etapa=celular, ?etapa=email e ?etapa=cadastro pulam a tela de boas-vindas.
  const initial: Step = etapa === "codigo" ? "mfa" : etapa === "celular" || etapa === "email" || etapa === "cadastro" ? "identifier" : "welcome";
  const [step, setStep] = useState<Step>(initial);
  const [signup, setSignup] = useState(etapa === "cadastro");
  const [existing, setExisting] = useState(false);
  const [mfaCode, setMfaCode] = useState("");
  const [useRecovery, setUseRecovery] = useState(false);
  const [useEmail, setUseEmail] = useState(etapa === "email");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [sentTo, setSentTo] = useState("");
  const [name, setName] = useState("");
  const [cpf, setCpf] = useState("");
  const [accept, setAccept] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  // Login direto da primeira tela: celular ou e-mail, senha e "Lembrar de mim".
  const [who, setWho] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [remember, setRemember] = useState(true);
  const [google, setGoogle] = useState<{ enabled: boolean; pending: { name: string; email: string } | null } | null>(null);
  const googleReason = params.get("google");
  const { busy, error, run, setError } = useAction();

  // Conta nova pelo Google volta aqui para concluir; o status também diz se a entrada com Google está ligada.
  useEffect(() => {
    fetch("/api/auth/google/status").then((r) => r.json()).then((g) => {
      setGoogle(g);
      if (googleReason === "novo" && g.pending) {
        setName(g.pending.name);
        window.history.replaceState({ ...window.history.state, prumoStep: "google", prumoDepth: 0 }, "");
        setStep("google");
      }
    }).catch(() => setGoogle({ enabled: false, pending: null }));
  }, [googleReason]);

  const identifier = useEmail ? email.trim() : phone;
  const shownIdentifier = useEmail ? email.trim() : maskPhone(phone);

  // O botão voltar do aparelho precisa voltar uma etapa, não sair da tela.
  useEffect(() => {
    window.history.replaceState({ ...window.history.state, prumoStep: initial, prumoDepth: 0 }, "");
    const onPop = (e: PopStateEvent) => { setError(null); setNotice(null); setExisting(false); setStep((e.state?.prumoStep as Step) ?? "welcome"); };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [setError, initial]);

  // Primeira vez neste aparelho (nunca entrou aqui): abre direto em "criar conta". Quem já entrou vê o login.
  // Só quando a entrada abre na tela inicial (sem ?etapa= nem volta do Google). A abertura do app cobre a troca.
  useEffect(() => {
    if (initial !== "welcome" || etapa === "login" || googleReason || isReturning()) return;
    setSignup(true);
    setUseEmail(false);
    window.history.replaceState({ ...window.history.state, prumoStep: "identifier", prumoDepth: 0 }, "");
    setStep("identifier");
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Quem caiu em "criar conta" mas já tem conta: volta ao login.
  const toLogin = () => {
    setError(null);
    setExisting(false);
    setSignup(false);
    window.history.replaceState({ ...window.history.state, prumoStep: "welcome", prumoDepth: 0 }, "");
    setStep("welcome");
  };

  const go = (next: Step) => {
    setError(null);
    setNotice(null);
    setExisting(false);
    setPassword("");
    const depth = (window.history.state?.prumoDepth ?? 0) + 1;
    window.history.pushState({ ...window.history.state, prumoStep: next, prumoDepth: depth }, "");
    setStep(next);
  };

  // Voltar uma etapa; se a pessoa abriu direto numa etapa, volta para as boas-vindas em vez de sair da tela.
  const goBack = () => {
    if ((window.history.state?.prumoDepth ?? 0) > 0) { window.history.back(); return; }
    setError(null);
    setExisting(false);
    window.history.replaceState({ ...window.history.state, prumoStep: "welcome", prumoDepth: 0 }, "");
    setStep("welcome");
  };

  // Para dirigir, a pessoa cria a conta de passageiro e segue para "Seja motorista".
  const finish = (userRole: string) => {
    // Recém-entrou: vai direto para a tela inicial, sem repetir a abertura. E da próxima vez, a entrada abre no login.
    skipNextSplash();
    markReturning();
    window.location.href = forDriver && userRole === "passenger" ? "/passageiro/dirigir" : HOME[userRole] ?? "/passageiro";
  };

  const start = (opts: { email?: boolean; signup?: boolean }) => {
    setUseEmail(!!opts.email);
    setSignup(!!opts.signup);
    go("identifier");
  };

  const submitIdentifier = () => {
    if (!useEmail && phone.length < 10) { setError("Digite o celular com DDD."); return; }
    run(async () => {
      const { exists } = await api<{ exists: boolean }>("/api/auth/lookup", { body: { identifier } });
      // "Criar conta" com um celular ou e-mail que já tem conta: avisa e oferece entrar.
      // Segue sozinho para a senha, sem parar num aviso.
      const wasSignup = signup;
      if (exists && wasSignup) setSignup(false);
      go(exists ? "password" : "name");
      if (exists && wasSignup) setNotice(`Este ${useEmail ? "e-mail" : "número"} já tem conta. Digite sua senha para entrar.`);
    });
  };

  // Primeira tela: entra direto. Guarda celular/e-mail no estado para o código do autenticador e a recuperação de senha.
  const keepWho = (p: { email: boolean; id: string }) => { setUseEmail(p.email); if (p.email) setEmail(p.id); else setPhone(p.id); };
  const submitDirect = () => {
    const p = parseWho(who);
    if (!p) { setError("Digite seu celular com DDD ou seu e-mail."); return; }
    if (!password) { setError("Digite sua senha."); return; }
    keepWho(p);
    run(async () => {
      const u = await api<{ role?: string; mfaRequired?: boolean }>("/api/auth/login", { body: { identifier: p.id, password, remember } });
      if (u.mfaRequired) { setMfaCode(""); go("mfa"); return; }
      finish(u.role!);
    });
  };
  const forgotDirect = () => {
    const p = parseWho(who);
    if (!p) { setError("Digite seu celular ou e-mail acima para receber o código."); return; }
    keepWho(p);
    run(async () => {
      const r = await api<{ sentTo: string }>("/api/auth/reset-request", { body: { identifier: p.id } });
      setSentTo(r.sentTo);
      setCode("");
      go("reset");
    });
  };

  const submitLogin = () => run(async () => {
    const u = await api<{ role?: string; mfaRequired?: boolean }>("/api/auth/login", { body: { identifier, password, remember } });
    if (u.mfaRequired) { setMfaCode(""); go("mfa"); return; }
    finish(u.role!);
  });

  const submitMfa = () => run(async () => {
    const u = await api<{ role: string }>("/api/auth/mfa", { body: { code: mfaCode } });
    finish(u.role);
  });

  const requestReset = () => run(async () => {
    const r = await api<{ sentTo: string }>("/api/auth/reset-request", { body: { identifier } });
    setSentTo(r.sentTo);
    setCode("");
    if (step !== "reset") go("reset");
  });

  const submitReset = () => run(async () => {
    const u = await api<{ role?: string; mfaRequired?: boolean }>("/api/auth/reset-confirm", { body: { identifier, code, password } });
    if (u.mfaRequired) { setMfaCode(""); go("mfa"); return; }
    finish(u.role!);
  });

  // CPF: confere os dígitos aqui e pergunta ao servidor se já está em outra conta, antes de chegar à senha.
  const checkCpf = async () => {
    if (!isValidCpf(cpf)) throw new Error("CPF inválido. Confira os números.");
    const { exists } = await api<{ exists: boolean }>("/api/auth/lookup", { body: { cpf } });
    if (exists) throw new Error("Este CPF já está em outra conta. Se ela é sua, entre por ela; se você não criou essa conta, fale com o suporte em Contato.");
  };

  const submitCpf = () => {
    if (!isValidCpf(cpf)) { setError("CPF inválido. Confira os números."); return; }
    run(async () => { await checkCpf(); go(useEmail ? "create" : "email"); });
  };

  // O e-mail de contato não pode estar em outra conta: a consulta já confere isso e o domínio.
  const submitContactEmail = () => {
    if (!isValidEmailFormat(contactEmail)) { setError("Digite um e-mail válido."); return; }
    run(async () => {
      const { exists } = await api<{ exists: boolean }>("/api/auth/lookup", { body: { identifier: contactEmail.trim() } });
      if (exists) throw new Error("Este e-mail já está em outra conta. Use outro ou entre com ele.");
      go("create");
    });
  };

  // Toda conta nasce passageiro: virar motorista é um passo dentro da conta.
  const submitRegister = () => run(async () => {
    const u = await api<{ role: string }>("/api/auth/register", {
      body: { name, password, cpf, acceptPrivacy: accept || undefined, ...(useEmail ? { email: identifier } : { phone: identifier, email: contactEmail.trim() }) },
    });
    finish(u.role);
  });

  const submitGoogle = () => {
    if (!isFullName(name)) { setError("Digite nome e sobrenome."); return; }
    if (!isValidCpf(cpf)) { setError("CPF inválido. Confira os números."); return; }
    run(async () => {
      await checkCpf();
      const u = await api<{ role: string }>("/api/auth/google/complete", { body: { name, cpf, acceptPrivacy: accept || undefined } });
      finish(u.role);
    });
  };

  const back = (
    <button type="button" onClick={goBack} aria-label="Voltar" className="-ml-3 mb-4 grid size-11 place-items-center rounded-full hover:bg-surface-2"><Icon name="back" size={22} /></button>
  );

  const acceptBox = (
    <label className="mt-5 flex items-start gap-3 text-sm">
      <input type="checkbox" name="accept" className="mt-0.5 size-5 shrink-0 accent-[var(--primary)]" checked={accept} onChange={(e) => setAccept(e.target.checked)} />
      <span>Li e aceito os <Link href="/termos" target="_blank" className="underline">termos de uso</Link> e a <Link href="/privacidade" target="_blank" className="underline">política de privacidade</Link>.</span>
    </label>
  );

  const cpfInput = (autoFocus: boolean) => (
    <input className="input num text-lg" name="cpf" inputMode="numeric" autoComplete="off" autoFocus={autoFocus} required placeholder="000.000.000-00"
      value={maskCpf(cpf)} onChange={(e) => setCpf(onlyDigits(e.target.value).slice(0, 11))} />
  );

  // Telas do cadastro, para o traço de progresso: nome, CPF, (e-mail de contato), senha.
  const signupSteps: Step[] = useEmail ? ["name", "cpf", "create"] : ["name", "cpf", "email", "create"];
  const progress = signupSteps.includes(step) && <Progress at={signupSteps.indexOf(step) + 1} total={signupSteps.length} />;

  // "Ou continue com": Google e Apple, no login e no começo do cadastro.
  const tile = "ag-glass grid h-[60px] flex-1 place-items-center rounded-[20px] transition-transform hover:-translate-y-0.5 [&_svg]:size-7";
  const socials = !SOCIAL_LOGIN ? null : (
    <>
      <div className="mt-7 flex items-center gap-4 text-[11px] font-semibold tracking-[.22em] text-[#536071] uppercase [[data-theme=dark]_&]:text-[#95A2B6]" aria-hidden="true">
        <span className="h-px flex-1 bg-[#0356C5]/25" />ou continue com<span className="h-px flex-1 bg-[#0356C5]/25" />
      </div>
      <div className="mt-5 flex justify-center gap-4">
        {/* Google sempre aparece; sem a credencial configurada, o toque explica em vez de sair da tela. */}
        <a href={`/api/auth/google/start${perfil ? `?perfil=${encodeURIComponent(perfil)}` : ""}`} aria-label="Continuar com Google" className={tile}
          onClick={(e) => { if (google && !google.enabled) { e.preventDefault(); setNotice(GOOGLE_OFF); return; } skipNextSplash(); }}>
          <GoogleG />
        </a>
        {/* Apple ainda não configurado: o botão já fica no lugar. */}
        <button type="button" aria-label="Continuar com Apple" className={tile} onClick={() => setNotice(APPLE_SOON)}><AppleLogo /></button>
      </div>
    </>
  );

  let content: React.ReactNode;

  if (step === "welcome") {
    content = (
      <form className="anim-rise" noValidate onSubmit={(e) => { e.preventDefault(); submitDirect(); }}>
        {/* Símbolo da Orbi num bloco de vidro */}
        <div className="ag-glass mx-auto grid size-[118px] place-items-center rounded-[36px] sm:size-[128px]">
          <OrbiMark size={70} gid="entrar-hero" />
        </div>
        <h1 className="display mt-6 text-center text-[1.95rem] leading-none sm:text-[2.2rem]">Bem-vindo de volta</h1>
        <p className="mt-2.5 text-center text-[13px] tracking-[.22em] text-[#536071] [[data-theme=dark]_&]:text-[#95A2B6]">Entre para continuar</p>

        <div className="mt-7 space-y-3.5">
          <label className="relative block">
            <span className="sr-only">Celular ou e-mail</span>
            <span aria-hidden="true" className="pointer-events-none absolute top-1/2 left-4 -translate-y-1/2 text-[#536071] [[data-theme=dark]_&]:text-[#95A2B6]"><Icon name="user" size={22} /></span>
            <input className="input !pl-12 text-[15px]" name="identifier" aria-label="Celular ou e-mail" autoComplete="username" autoCapitalize="none" spellCheck={false}
              placeholder="Celular ou e-mail" value={who}
              onChange={(e) => { const v = e.target.value; setWho(/[@a-z]/i.test(v) ? v : maskPhone(phoneDigits(v))); }} />
          </label>
          <label className="relative block">
            <span className="sr-only">Senha</span>
            <span aria-hidden="true" className="pointer-events-none absolute top-1/2 left-4 -translate-y-1/2 text-[#536071] [[data-theme=dark]_&]:text-[#95A2B6]"><Icon name="lock" size={22} /></span>
            <input className="input !pr-14 !pl-12 text-[15px]" name="password" aria-label="Senha" type={showPass ? "text" : "password"} autoComplete="current-password"
              placeholder="Senha" value={password} onChange={(e) => setPassword(e.target.value)} />
            <button type="button" onClick={() => setShowPass(!showPass)} aria-label={showPass ? "Esconder senha" : "Mostrar senha"} aria-pressed={showPass}
              className="absolute top-1/2 right-2 grid size-11 -translate-y-1/2 place-items-center rounded-full text-[#536071] hover:text-[#0356C5] [[data-theme=dark]_&]:text-[#95A2B6]">
              <Icon name={showPass ? "eye" : "eyeOff"} size={22} />
            </button>
          </label>
        </div>

        <div className="mt-4 flex items-center justify-between gap-3 text-sm">
          <label className="flex cursor-pointer items-center gap-2.5 font-medium">
            <input type="checkbox" name="remember" className="size-5 accent-[#0356C5]" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
            Lembrar de mim
          </label>
          <button type="button" className="font-semibold text-[#0356C5] hover:underline [[data-theme=dark]_&]:text-[#6AA8FF]" disabled={busy} onClick={forgotDirect}>Esqueci a senha</button>
        </div>

        <div className="mt-3" aria-live="polite">
          <ErrorNote>{error}</ErrorNote>
          {notice && <Note tone="warn">{notice}</Note>}
          {googleReason && googleReason !== "novo" && GOOGLE_REASON[googleReason] && <Note tone="warn">{GOOGLE_REASON[googleReason]}</Note>}
        </div>

        <button className="ag-cta relative mt-3 flex h-[58px] w-full items-center justify-center rounded-full text-lg font-semibold" disabled={busy}>
          {busy ? "Entrando…" : "Entrar"}
          <span aria-hidden="true" className="absolute top-1/2 right-2.5 grid size-10 -translate-y-1/2 place-items-center rounded-full bg-white/20"><Icon name="arrow" size={20} /></span>
        </button>

        {socials}

        <p className="mt-7 text-center text-[15px] text-[#536071] [[data-theme=dark]_&]:text-[#95A2B6]">
          Ainda não tem conta? <button type="button" className="font-semibold text-[#0356C5] underline-offset-4 hover:underline [[data-theme=dark]_&]:text-[#6AA8FF]" onClick={() => start({ signup: true })}>Criar conta</button>
        </p>
        <p className="mt-6 text-center text-[11px] font-semibold tracking-[.24em] text-[#536071] uppercase [[data-theme=dark]_&]:text-[#95A2B6]" aria-hidden="true">Peça · Acompanhe · Chegue</p>
        <p className="mt-3 text-center text-[11px] leading-relaxed text-[#536071] [[data-theme=dark]_&]:text-[#95A2B6]">
          Ao entrar, você concorda com os <Link href="/termos" className="underline">termos de uso</Link> e a <Link href="/privacidade" className="underline">política de privacidade</Link>.
          {!forDriver && <> · <Link href="/motoristas" className="underline">Quer dirigir com a Orbi?</Link></>}
        </p>
      </form>
    );
  } else if (step === "identifier") {
    content = (
      <form key={String(useEmail)} className="anim-rise" onSubmit={(e) => { e.preventDefault(); submitIdentifier(); }}>
        {back}
        <h1 className="display text-4xl">{signup ? "Crie sua conta" : useEmail ? "Qual é o seu e-mail?" : "Qual é o seu celular?"}</h1>
        <p className="mt-2 text-muted">{signup ? (useEmail ? "Comece pelo seu e-mail. Leva menos de um minuto." : "Comece pelo seu celular. Leva menos de um minuto.") : "Serve para entrar na sua conta ou criar uma nova."}</p>
        <label className="mt-6 block">
          <span className="sr-only">{useEmail ? "E-mail" : "Celular com DDD"}</span>
          {useEmail
            ? <input className="input text-lg" name="email" type="email" autoComplete="username" autoFocus required placeholder="voce@email.com" value={email} onChange={(e) => { setExisting(false); setEmail(e.target.value); }} />
            : <input className="input num text-lg" name="phone" type="tel" inputMode="tel" autoComplete="tel-national" autoFocus required placeholder="(31) 99999-9999" value={maskPhone(phone)} onChange={(e) => { setExisting(false); setPhone(phoneDigits(e.target.value)); }} />}
        </label>
        <div className="mt-3" aria-live="polite"><ErrorNote>{error}</ErrorNote>{notice && <Note tone="warn">{notice}</Note>}</div>
        {existing && (
          <div className="mt-3 rounded-[22px] bg-surface-2 p-4" role="status">
            <p className="text-sm">{useEmail ? "Este e-mail já tem uma conta na Orbi." : "Este celular já tem uma conta na Orbi."}</p>
            <button type="button" className="btn btn-soft mt-3 w-full !bg-surface" onClick={() => { setSignup(false); go("password"); }}>Entrar nesta conta</button>
          </div>
        )}
        <button className="btn btn-primary btn-lg mt-3 w-full" disabled={busy}>{busy ? "Verificando…" : "Continuar"}</button>
        <button type="button" className="mt-4 w-full py-2 text-sm font-semibold underline" onClick={() => { setError(null); setExisting(false); setUseEmail(!useEmail); }}>{useEmail ? "Usar celular" : "Usar e-mail"}</button>
        {signup && socials}
        {signup && (
          <p className="mt-6 text-center text-[15px] text-[#536071] [[data-theme=dark]_&]:text-[#95A2B6]">
            Já tem conta? <button type="button" className="font-semibold text-[#0356C5] underline-offset-4 hover:underline [[data-theme=dark]_&]:text-[#6AA8FF]" onClick={toLogin}>Entrar</button>
          </p>
        )}
      </form>
    );
  } else if (step === "mfa") {
    content = (
      <form className="anim-rise" onSubmit={(e) => { e.preventDefault(); submitMfa(); }}>
        <span className="grid size-12 place-items-center rounded-full bg-surface-2 text-brand"><Icon name="lock" /></span>
        <h1 className="display mt-4 text-4xl">{useRecovery ? "Código de recuperação" : "Código do aplicativo"}</h1>
        <p className="mt-2 text-muted">{useRecovery ? "Digite um dos códigos de recuperação que você guardou. Cada um vale uma vez." : "Abra o aplicativo autenticador no seu celular e digite os 6 números da Orbi."}</p>
        <label className="mt-6 block">
          <span className="sr-only">{useRecovery ? "Código de recuperação" : "Código de 6 números"}</span>
          {useRecovery
            ? <input className="input num text-lg uppercase" name="recovery" autoComplete="off" autoFocus required placeholder="ABCD-1234-ABCD-1234" value={mfaCode} onChange={(e) => setMfaCode(e.target.value.toUpperCase().slice(0, 19))} />
            : <input className="input num text-center text-2xl tracking-[.5em]" name="otp" inputMode="numeric" autoComplete="one-time-code" autoFocus required placeholder="000000" maxLength={6} value={mfaCode} onChange={(e) => setMfaCode(e.target.value.replace(/\D/g, "").slice(0, 6))} />}
        </label>
        <div className="mt-3"><ErrorNote>{error}</ErrorNote></div>
        <button className="btn btn-primary btn-lg mt-3 w-full" disabled={busy || (useRecovery ? mfaCode.length < 10 : mfaCode.length !== 6)}>{busy ? "Conferindo…" : "Entrar"}</button>
        <button type="button" className="mt-4 w-full py-2 text-sm font-semibold underline" onClick={() => { setError(null); setMfaCode(""); setUseRecovery(!useRecovery); }}>{useRecovery ? "Usar o código do aplicativo" : "Perdi o celular: usar código de recuperação"}</button>
      </form>
    );
  } else if (step === "password") {
    content = (
      <form className="anim-rise" onSubmit={(e) => { e.preventDefault(); submitLogin(); }}>
        {back}
        <h1 className="display text-4xl">Digite sua senha</h1>
        <p className="num mt-2 text-muted">{shownIdentifier}</p>
        <label className="mt-6 block">
          <span className="sr-only">Senha</span>
          <input className="input text-lg" name="password" type="password" autoComplete="current-password" autoFocus required placeholder="Senha" value={password} onChange={(e) => setPassword(e.target.value)} />
        </label>
        <div className="mt-3"><ErrorNote>{error}</ErrorNote>{notice && <Note tone="warn">{notice}</Note>}</div>
        <button className="btn btn-primary btn-lg mt-3 w-full" disabled={busy}>{busy ? "Entrando…" : "Entrar"}</button>
        <button type="button" className="mt-4 w-full py-2 text-sm font-semibold underline" disabled={busy} onClick={requestReset}>Esqueci minha senha</button>
      </form>
    );
  } else if (step === "reset") {
    content = (
      <form className="anim-rise" onSubmit={(e) => { e.preventDefault(); submitReset(); }}>
        {back}
        <h1 className="display text-4xl">Crie uma nova senha</h1>
        <p className="mt-2 text-muted">Enviamos um código de 6 dígitos para <strong className="text-ink">{sentTo}</strong>. Ele vale por 15 minutos.</p>
        <label className="mt-6 block">
          <span className="mb-1.5 block text-sm font-semibold">Código</span>
          <input className="input num text-lg tracking-[.3em]" name="code" inputMode="numeric" autoComplete="one-time-code" autoFocus required maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} />
        </label>
        <label className="mt-4 block">
          <span className="mb-1.5 block text-sm font-semibold">Nova senha</span>
          <input className="input text-lg" name="new-password" type="password" autoComplete="new-password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} />
          <span className="mt-1 block text-xs text-muted">Pelo menos 8 caracteres.</span>
        </label>
        <div className="mt-3"><ErrorNote>{error}</ErrorNote></div>
        <button className="btn btn-primary btn-lg mt-3 w-full" disabled={busy}>{busy ? "Salvando…" : "Salvar nova senha"}</button>
        <button type="button" className="mt-4 w-full py-2 text-sm font-semibold underline" disabled={busy} onClick={requestReset}>Enviar outro código</button>
      </form>
    );
  } else if (step === "google" && google?.pending) {
    content = (
      <form className="anim-rise" onSubmit={(e) => { e.preventDefault(); submitGoogle(); }}>
        <h1 className="display text-4xl">Falta pouco</h1>
        <p className="mt-2 text-muted">Conta Google confirmada: <strong className="text-ink">{google.pending.email}</strong></p>
        <label className="mt-6 block">
          <span className="mb-1.5 block text-sm font-semibold">Nome completo</span>
          <input className="input text-lg" name="name" autoComplete="name" autoCapitalize="words" required value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <label className="mt-4 block">
          <span className="mb-1.5 block text-sm font-semibold">CPF</span>
          {cpfInput(false)}
        </label>
        <p className="mt-1 text-xs text-muted">{CPF_WHY}</p>
        {acceptBox}
        <div className="mt-3"><ErrorNote>{error}</ErrorNote></div>
        <button className="btn btn-primary btn-lg mt-3 w-full" disabled={busy}>{busy ? "Criando conta…" : "Criar conta"}</button>
      </form>
    );
  } else if (step === "name") {
    content = (
      <form className="anim-rise" onSubmit={(e) => { e.preventDefault(); if (!isFullName(name)) { setError("Digite nome e sobrenome."); return; } go("cpf"); }}>
        {back}
        {progress}
        <h1 className="display text-4xl">Qual é o seu nome completo?</h1>
        <p className="mt-2 text-muted">Quem dirige verá seu nome ao aceitar a corrida.</p>
        <label className="mt-6 block">
          <span className="sr-only">Nome completo</span>
          <input className="input text-lg" name="name" autoComplete="name" autoCapitalize="words" autoFocus required value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <div className="mt-3"><ErrorNote>{error}</ErrorNote></div>
        <button className="btn btn-primary btn-lg mt-3 w-full">Continuar</button>
      </form>
    );
  } else if (step === "cpf") {
    content = (
      <form className="anim-rise" onSubmit={(e) => { e.preventDefault(); submitCpf(); }}>
        {back}
        {progress}
        <h1 className="display text-4xl">Qual é o seu CPF?</h1>
        <p className="mt-2 text-muted">{CPF_WHY}</p>
        <label className="mt-6 block">
          <span className="sr-only">CPF</span>
          {cpfInput(true)}
        </label>
        <div className="mt-3"><ErrorNote>{error}</ErrorNote></div>
        <button className="btn btn-primary btn-lg mt-3 w-full" disabled={busy}>{busy ? "Verificando…" : "Continuar"}</button>
      </form>
    );
  } else if (step === "email") {
    content = (
      <form className="anim-rise" onSubmit={(e) => { e.preventDefault(); submitContactEmail(); }}>
        {back}
        {progress}
        <h1 className="display text-4xl">Qual é o seu e-mail?</h1>
        <p className="mt-2 text-muted">É por ele que você recupera a conta se esquecer a senha. Vamos mandar um código para confirmar.</p>
        <label className="mt-6 block">
          <span className="sr-only">E-mail de contato</span>
          <input className="input text-lg" name="contact-email" type="email" autoComplete="email" autoFocus required placeholder="voce@email.com" value={contactEmail} onChange={(e) => setContactEmail(e.target.value)} />
        </label>
        <div className="mt-3"><ErrorNote>{error}</ErrorNote></div>
        <button className="btn btn-primary btn-lg mt-3 w-full" disabled={busy}>{busy ? "Verificando…" : "Continuar"}</button>
      </form>
    );
  } else {
    content = (
      <form className="anim-rise" onSubmit={(e) => { e.preventDefault(); submitRegister(); }}>
        {back}
        {progress}
        <h1 className="display text-4xl">Crie uma senha</h1>
        <p className="mt-2 text-muted">Pelo menos 8 caracteres.</p>
        <label className="mt-6 block">
          <span className="sr-only">Nova senha</span>
          <input className="input text-lg" name="password" type="password" autoComplete="new-password" autoFocus required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} />
        </label>
        {acceptBox}
        <div className="mt-3"><ErrorNote>{error}</ErrorNote></div>
        <button className="btn btn-primary btn-lg mt-3 w-full" disabled={busy}>{busy ? "Criando conta…" : "Criar conta"}</button>
      </form>
    );
  }

  const welcome = step === "welcome";
  return (
    // Fundo azul bem claro com esferas de vidro; uma coluna centralizada, no celular e no computador.
    <div className="auth-glass relative flex min-h-svh flex-col overflow-hidden">
      <span aria-hidden="true" className="ag-sphere -top-24 -left-24 size-60" />
      <span aria-hidden="true" className="ag-sphere top-[21%] -right-14 size-28" />
      <span aria-hidden="true" className="ag-sphere -bottom-24 -left-20 size-52" />
      <span aria-hidden="true" className="ag-sphere -right-28 -bottom-28 size-72" />
      <header className="relative z-10 flex items-center justify-between px-4 pt-4">
        <span />
        <ThemeToggle className="ag-glass size-12 !rounded-2xl" />
      </header>
      {forDriver && (
        <p className="ag-glass relative z-10 mx-4 mt-3 flex items-start gap-3 rounded-[22px] px-4 py-3 text-sm sm:mx-auto sm:w-full sm:max-w-[420px]">
          <span className="mt-0.5 text-[#0356C5] [[data-theme=dark]_&]:text-[#6AA8FF]"><Icon name="steering" size={20} /></span>
          <span>Para dirigir, primeiro crie sua conta de passageiro. Depois é só pedir para ser motorista. <Link href="/motoristas/requisitos" className="font-semibold underline">Ver requisitos</Link></span>
        </p>
      )}
      <main className="relative z-10 flex flex-1 flex-col justify-center px-5 pt-2 pb-10">
        <div className="mx-auto w-full max-w-[420px]">
          {!welcome && <span role="img" aria-label="Orbi" className="ag-glass mx-auto mb-6 grid size-24 place-items-center rounded-[30px]"><OrbiMark size={56} gid="entrar-mark" /></span>}
          {content}
        </div>
      </main>
      {welcome && (
        <p aria-hidden="true" className="pointer-events-none absolute right-5 bottom-5 z-10 hidden text-[10px] leading-[1.35] font-semibold tracking-[.2em] text-[#536071] uppercase sm:block [[data-theme=dark]_&]:text-[#95A2B6]">
          Mais<br />que uma<br />corrida<span className="mt-1.5 block h-px w-5 bg-current" />
        </p>
      )}
    </div>
  );
}

export default function Entrar() {
  return <Suspense><Flow /></Suspense>;
}
