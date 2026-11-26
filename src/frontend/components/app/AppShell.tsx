"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { backTarget, cleanPath } from "@/shared/back-target";
import { Logo } from "@/frontend/components/Logo";
import { Icon } from "@/frontend/components/Icon";
import { api, dateTime, ThemeToggle, useLive } from "@/frontend/components/ui";
import { markReturning } from "@/frontend/lib/visitor";
import { skipNextSplash } from "@/frontend/lib/splash";
import AppSplash from "@/frontend/components/app/AppSplash";
import { IconGlyph, type GlyphName } from "@/frontend/components/IconGlyph";

/** img: ícone na barra de baixo do celular (o ativo fica colorido, os outros em cinza). */
export type NavItem = { href: string; label: string; icon: string; img?: GlyphName };

function Notifications() {
  const { data, reload } = useLive<{ notifications: { id: string; title: string; body: string; link: string | null; readAt: string | null; createdAt: string }[] }>("/api/account/notifications");
  const [open, setOpen] = useState(false);
  const unread = data?.notifications.filter((n) => !n.readAt).length ?? 0;
  const toggle = async () => {
    const next = !open;
    setOpen(next);
    if (next && unread) { await api("/api/account/notifications", { body: {} }); reload(); }
  };
  return (
    <div className="relative">
      <button type="button" onClick={toggle} aria-expanded={open} aria-label={unread ? `Notificações, ${unread} nova${unread > 1 ? "s" : ""}` : "Notificações"} className="relative grid size-11 place-items-center rounded-full hover:bg-surface-2">
        <Icon name="bell" size={20} />
        {unread > 0 && <span className="absolute top-2 right-2 size-2.5 rounded-full bg-primary" />}
      </button>
      {open && (
        <div className="card anim-rise absolute top-12 right-0 z-[60] max-h-[70svh] w-[min(340px,calc(100vw-2rem))] overflow-auto p-2">
          {!data?.notifications.length && <p className="p-4 text-sm text-muted">Nenhuma notificação por aqui.</p>}
          {data?.notifications.map((n) => (
            <div key={n.id} className="rounded-xl p-3 hover:bg-surface-2">
              <p className="text-sm font-semibold">{n.title}</p>
              <p className="text-sm text-muted">{n.body}</p>
              <p className="mt-1 text-xs text-muted">{dateTime(n.createdAt)}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/** Faixa de "sem internet": no 4G o sinal cai em túneis e áreas sem cobertura. O app se recupera sozinho quando volta. */
function OfflineBanner() {
  const [offline, setOffline] = useState(false);
  useEffect(() => {
    const on = () => setOffline(!navigator.onLine);
    on();
    addEventListener("online", on);
    addEventListener("offline", on);
    return () => { removeEventListener("online", on); removeEventListener("offline", on); };
  }, []);
  if (!offline) return null;
  return (
    <div role="status" className="sticky top-14 z-40 flex items-center justify-center gap-2 bg-[var(--warn)] px-4 py-2 text-center text-sm font-semibold text-white md:top-16">
      <span className="size-2 animate-pulse rounded-full bg-white" />Sem internet. Assim que o sinal voltar, o app atualiza sozinho.
    </div>
  );
}

/**
 * Troca de modo: motorista também é passageiro. No app do motorista aparece "Modo passageiro";
 * no do passageiro, "Modo motorista" só para quem tem conta de motorista (papel vem de /api/me).
 */
function ModeSwitch({ root }: { root: string }) {
  const [role, setRole] = useState<string | null>(null);
  const inDriver = root === "/motorista";
  const inPassenger = root === "/passageiro";
  useEffect(() => {
    if (!inPassenger) return;
    let live = true;
    api<{ user: { role: string } | null }>("/api/me").then((r) => { if (live) setRole(r.user?.role ?? null); }).catch(() => {});
    return () => { live = false; };
  }, [inPassenger]);
  if (!inDriver && !(inPassenger && role === "driver")) return null;
  const to = inDriver ? { href: "/passageiro", label: "Modo passageiro", short: "Passageiro", icon: "user" } : { href: "/motorista", label: "Modo motorista", short: "Motorista", icon: "steering" };
  // Link comum (não <Link>): cada app tem seu próprio layout protegido no servidor.
  return (
    <a href={to.href} onClick={skipNextSplash} aria-label={to.label} data-testid="mode-switch"
      className="mr-1 inline-flex h-11 items-center gap-1.5 rounded-full md:h-9 bg-surface-2 px-3 text-xs font-semibold transition-colors hover:bg-[color-mix(in_srgb,var(--primary)_14%,transparent)] hover:text-brand md:text-sm">
      <Icon name={to.icon} size={16} /><span className="md:hidden">{to.short}</span><span className="hidden md:inline">{to.label}</span>
    </a>
  );
}

/** Estrutura dos aplicativos: barra inferior no celular, lateral no computador. */
/** topNav: no computador, barra escura com menu em pílulas no lugar da lateral (passageiro). No celular nada muda. */
export function AppShell({ nav, title, children, flush, topNav = false, backExceptions }: { nav: NavItem[]; title: string; children: React.ReactNode; flush?: boolean; topNav?: boolean; backExceptions?: Record<string, string> }) {
  const path = usePathname();
  const router = useRouter();
  // Caminho anterior dentro do app: se for o próprio destino da seta, voltamos no histórico (o voltar do Android não vira vaivém).
  const cur = useRef<string | null>(null);
  const prev = useRef<string | null>(null);
  useEffect(() => { prev.current = cur.current; cur.current = cleanPath(path); }, [path]);
  // Abriu o app já conectado: da próxima vez que sair, a entrada abre no login (e não em "criar conta").
  useEffect(() => { markReturning(); }, []);
  const root = nav[0].href;
  const isActive = (href: string) => (href === root ? path === root : path.startsWith(href));
  const back = backTarget(path, root, nav.map((n) => n.href), backExceptions);
  const backLabel = back ? (nav.find((n) => cleanPath(n.href) === back)?.label ?? "Início") : "";
  // Nas abas principais o menu de pílulas do computador já resolve; só as subtelas mostram a seta no md+.
  const onMainTab = nav.some((n) => cleanPath(n.href) === cleanPath(path));
  const goBack = () => {
    if (!back) return;
    if (prev.current === back) router.back(); else router.push(back);
  };
  const logout = async () => { await api("/api/auth/logout", { body: {} }); skipNextSplash(); window.location.href = "/entrar"; };
  return (
    <div className={`flex min-h-svh flex-col bg-bg [--nav-h:calc(4rem+env(safe-area-inset-bottom))] ${topNav ? "" : "md:flex-row"}`}>
      {/* Abertura: ela mesma decide se aparece (uma vez por sessão do navegador). */}
      <AppSplash />
      <aside className={`sticky top-0 hidden h-svh w-60 shrink-0 flex-col border-r border-line bg-surface p-4 ${topNav ? "" : "md:flex"}`}>
        <Link href={root} className="mb-6 px-2" aria-label="Orbi, tela inicial"><Logo size={22} hole="var(--surface)" /></Link>
        <nav aria-label={title} className="flex-1 space-y-1">
          {nav.map((n) => (
            <Link key={n.href} href={n.href} aria-current={isActive(n.href) ? "page" : undefined}
              className={`flex items-center gap-3 rounded-xl px-3 py-2.5 font-medium transition-colors ${isActive(n.href) ? "bg-surface-2 text-brand" : "hover:bg-surface-2"}`}>
              <Icon name={n.icon} size={20} weight={isActive(n.href) ? "fill" : "regular"} />{n.label}
            </Link>
          ))}
        </nav>
        <button type="button" onClick={logout} className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-muted hover:bg-surface-2"><Icon name="logout" size={20} /> Sair</button>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className={`sticky top-0 z-40 bg-surface md:bg-[color-mix(in_srgb,var(--surface)_96%,transparent)] md:backdrop-blur-xl flex h-[calc(3.5rem+env(safe-area-inset-top))] items-center pt-[env(safe-area-inset-top)] justify-between border-b border-line px-3 ${topNav ? "md:h-16 md:px-8 md:pt-0" : "md:h-14 md:justify-end md:pt-0"}`}>
          {back && (
            <button type="button" onClick={goBack} aria-label={`Voltar para ${backLabel}`} data-testid="app-back"
              className={`-ml-1 grid size-11 shrink-0 place-items-center rounded-full hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--primary)] ${onMainTab ? "md:hidden" : ""} ${topNav ? "" : "md:hidden"}`}>
              <Icon name="back" size={22} />
            </button>
          )}
          <Link href={root} className="mr-auto flex min-h-11 items-center px-1 md:hidden" aria-label="Orbi, tela inicial"><Logo size={26} hole="var(--surface)" /></Link>
          {topNav && (
            <div className="hidden min-w-0 flex-1 items-center gap-6 md:flex">
              <Link href={root} aria-label="Orbi, tela inicial"><Logo size={22} hole="var(--surface)" /></Link>
              <nav aria-label={title} className="flex items-center gap-1">
                {nav.map((n) => (
                  <Link key={n.href} href={n.href} aria-current={isActive(n.href) ? "page" : undefined}
                    className={`rounded-full px-3.5 py-2 text-sm font-semibold transition-colors ${isActive(n.href) ? "bg-ink text-bg" : "hover:bg-surface-2"}`}>{n.label}</Link>
                ))}
              </nav>
            </div>
          )}
          <div className="flex items-center"><ModeSwitch root={root} /><ThemeToggle /><Notifications />
            {topNav && <button type="button" onClick={logout} className="ml-1 hidden rounded-full px-3.5 py-2 text-sm font-semibold hover:bg-surface-2 md:block">Sair</button>}
            {/* Passageiro e motorista saem pela tela Conta; a equipe não tem essa tela. */}
            {!nav.some((n) => n.href.endsWith("/conta")) && <button type="button" onClick={logout} aria-label="Sair" className="grid size-11 place-items-center rounded-full hover:bg-surface-2 md:hidden"><Icon name="logout" size={20} /></button>}
          </div>
        </header>
        <OfflineBanner />
        <main className={`flex-1 ${flush ? "" : "mx-auto w-full max-w-4xl p-4 pb-[calc(var(--nav-h)+1.5rem)] md:p-8"}`}>{children}</main>
      </div>

      {/* Barra de baixo flutuante: o item ativo ganha o ícone cheio e uma pílula tonal, sem mudar de tamanho; os outros ficam com a cor apagada (não cinza). */}
      <nav aria-label={title}
        /* Celular: barra sólida, colada na borda de baixo (nada de conteúdo aparecendo por trás ou pelos cantos). A altura é a variável --nav-h, usada para reservar o espaço no fim das telas. */
        className="fixed inset-x-0 bottom-0 z-40 flex h-[var(--nav-h)] gap-1 border-t border-line bg-surface px-2 pt-1.5 pb-[env(safe-area-inset-bottom)] md:hidden">
        {nav.map((n) => {
          const on = isActive(n.href);
          return (
            <Link key={n.href} href={n.href} aria-current={on ? "page" : undefined}
              className={`relative flex flex-1 flex-col items-center justify-center gap-0.5 rounded-[20px] text-[11px] leading-tight transition-colors duration-200 ${on ? "font-bold text-brand" : "font-semibold text-muted active:bg-surface-2"}`}>
              {n.img
                ? <span className={`grid h-8 w-14 place-items-center rounded-full transition-colors duration-200 motion-reduce:transition-none ${on ? "bg-tint" : ""}`}>
                    <IconGlyph name={n.img} size={24} bare filled={on} tone={on ? "brand" : "quiet"} behind={on ? "var(--tint)" : "var(--surface)"} />
                  </span>
                : <Icon name={n.icon} size={24} weight={on ? "fill" : "regular"} />}
              {n.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}

export function PageTitle({ children, sub }: { children: React.ReactNode; sub?: string }) {
  return <div className="mb-7"><h1 className="display text-3xl md:text-[2.75rem]">{children}</h1>{sub && <p className="mt-2 max-w-2xl text-muted">{sub}</p>}</div>;
}
