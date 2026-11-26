"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { motion, useScroll, useSpring } from "motion/react";
import { Logo } from "@/frontend/components/Logo";
import { OrbiAccent } from "@/frontend/components/OrbiMark";
import { Icon } from "@/frontend/components/Icon";
import { useAppHref } from "./app-origin";

const LINKS = [
  { href: "/como-funciona", label: "Como funciona" },
  { href: "/passageiros", label: "Passageiros" },
  { href: "/motoristas", label: "Motoristas" },
  { href: "/clube", label: "Clube Orbi" },
  { href: "/empresa", label: "A empresa" },
];

/** account: endereço do app de quem já entrou. Assim o site e o app funcionam como uma coisa só. */
export function SiteNav({ account = null }: { account?: string | null }) {
  const [open, setOpen] = useState(false);
  const path = usePathname();
  const appHref = useAppHref();
  useEffect(() => setOpen(false), [path]);
  // Barra branca, como o resto do site (as partes escuras são painéis abaixo dela).
  const overHero = false;
  const pill = "rounded-full px-3.5 py-2 text-sm font-semibold transition-colors hover:bg-[color-mix(in_srgb,currentColor_12%,transparent)]";

  return (
    <header className={`fixed inset-x-0 top-0 z-50 pt-[env(safe-area-inset-top)] transition-colors duration-300 ${overHero ? "on-deep border-b border-[color-mix(in_srgb,var(--on-deep)_8%,transparent)] bg-[color-mix(in_srgb,var(--deep)_78%,transparent)] text-on-deep backdrop-blur-xl" : "border-b border-line bg-bg text-ink md:bg-[color-mix(in_srgb,var(--bg)_88%,transparent)] md:backdrop-blur-lg"}`}>
      <div className="mx-auto flex h-16 max-w-[1440px] items-center justify-between gap-2 px-5 md:px-10">
        <Link href="/" aria-label="Orbi, página inicial" className="flex min-h-11 items-center"><Logo size={24} hole={overHero ? "var(--deep)" : "var(--bg)"} /></Link>
        <nav aria-label="Principal" className="mr-auto ml-4 hidden items-center gap-1 lg:flex">
          {LINKS.map((l) => <Link key={l.href} href={l.href} aria-current={path === l.href ? "page" : undefined} className={pill}>{l.label}</Link>)}
        </nav>
        <div className="flex items-center gap-1">
          <Link href="/ajuda" className={`${pill} hidden lg:block`}>Ajuda</Link>
          {account
            ? <Link href={appHref(account)} className="rounded-full bg-[var(--cta)] px-4 py-2 text-sm font-semibold text-white transition-transform hover:-translate-y-px">Minha conta</Link>
            : <>
                <Link href={appHref("/entrar?etapa=login")} className={`${pill} hidden sm:block`}>Entrar</Link>
                <Link href={appHref("/cadastro")} className="hidden rounded-full bg-[var(--cta)] px-4 py-2 text-sm font-semibold text-white transition-transform hover:-translate-y-px sm:block">Criar conta</Link>
              </>}
          <button type="button" className="grid size-11 place-items-center lg:hidden" onClick={() => setOpen(!open)} aria-expanded={open} aria-label={open ? "Fechar menu" : "Abrir menu"}>
            <Icon name={open ? "close" : "menu"} />
          </button>
        </div>
      </div>
      {open && (
        <nav aria-label="Menu" className="anim-sheet max-h-[calc(100dvh-4rem)] overflow-y-auto border-t border-line bg-bg px-5 pt-2 pb-[max(1.25rem,env(safe-area-inset-bottom))] text-ink lg:hidden">
          {[...LINKS, { href: "/ajuda", label: "Ajuda" }].map((l) => <Link key={l.href} href={l.href} aria-current={path === l.href ? "page" : undefined} className="flex min-h-12 items-center justify-between border-b border-line text-lg font-medium aria-[current=page]:text-primary">{l.label}<Icon name="arrow" size={18} /></Link>)}
          <div className="mt-4 grid gap-2.5 sm:hidden">
            {account
              ? <Link href={appHref(account)} className="btn btn-primary">Minha conta</Link>
              : <>
                  <Link href={appHref("/cadastro")} className="btn btn-primary">Criar conta</Link>
                  <Link href={appHref("/entrar?etapa=login")} className="btn btn-ghost">Entrar</Link>
                </>}
          </div>
        </nav>
      )}
    </header>
  );
}

/** Progresso da leitura: uma linha fina com o degradê da marca, presa ao topo, que cresce com a rolagem. */
export function PlumbLine() {
  const { scrollYProgress } = useScroll();
  const scaleX = useSpring(scrollYProgress, { stiffness: 140, damping: 28 });
  return (
    <motion.div aria-hidden="true" style={{ scaleX, transformOrigin: "0 50%", background: "var(--grad)" }}
      className="pointer-events-none fixed inset-x-0 top-0 z-[60] h-[2px]" />
  );
}

type FooterGroup = { title: string; links: [string, string][] };

export function SiteFooter({ cities = [] }: { cities?: { slug: string; name: string }[] }) {
  const groups: FooterGroup[] = [
    { title: "Plataforma", links: [["Como funciona", "/como-funciona"], ["Passageiros", "/passageiros"], ["Motoristas", "/motoristas"], ["Requisitos para dirigir", "/motoristas/requisitos"], ["Clube Orbi", "/clube"]] },
    ...(cities.length > 0 ? [{ title: "Cidades", links: cities.map((c) => [c.name, `/cidades/${c.slug}`] as [string, string]) }] : []),
    { title: "Empresa", links: [["A empresa", "/empresa"], ["Central de ajuda", "/ajuda"], ["Seja um parceiro", "/parceiros"], ["Tenho interesse", "/interesse"], ["Contato", "/contato"]] },
    { title: "Transparência", links: [["Privacidade", "/privacidade"], ["Termos de uso", "/termos"], ["Termo do motorista", "/termos-motorista"], ["O que já funciona", "/status"], ["Créditos", "/creditos"]] },
  ];
  return (
    <footer className="on-deep bg-deep text-on-deep">
      <div className="mx-auto grid max-w-[1440px] grid-cols-2 gap-x-6 gap-y-8 px-5 py-10 md:grid-cols-[1.5fr_1fr_1fr_1fr_1fr] md:gap-10 md:px-10 md:py-14">
        <div className="col-span-2 md:col-span-1">
          <Logo size={28} />
          <p className="mt-4 max-w-xs text-on-deep-muted">Mobilidade urbana mais simples, rápida e segura.</p>
          <p className="mt-2 text-sm text-on-deep-muted max-md:hidden">Primeira operação: Ipatinga, Coronel Fabriciano e Timóteo, em Minas Gerais.</p>
        </div>
        {/* Computador: colunas abertas. */}
        {groups.map((g) => <FooterCol key={g.title} {...g} />)}
        {/* Celular: um acordeão por grupo e os links legais numa linha só. */}
        <div className="col-span-2 md:hidden">
          <div className="border-t border-[color-mix(in_srgb,var(--on-deep)_14%,transparent)]">
            {groups.map((g) => (
              <details key={g.title} className="group border-b border-[color-mix(in_srgb,var(--on-deep)_14%,transparent)]">
                <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between font-semibold [&::-webkit-details-marker]:hidden">
                  {g.title}
                  <span aria-hidden="true" className="transition-transform duration-200 group-open:rotate-45"><Icon name="plus" size={18} /></span>
                </summary>
                <ul className="pb-2">
                  {g.links.map(([label, href]) => <li key={href}><Link href={href} className="flex min-h-11 items-center text-on-deep-muted hover:underline">{label}</Link></li>)}
                </ul>
              </details>
            ))}
          </div>
          <p className="mt-4 flex flex-wrap gap-x-4 text-sm text-on-deep-muted">
            {[["Privacidade", "/privacidade"], ["Termos", "/termos"], ["Créditos", "/creditos"]].map(([label, href]) => <Link key={href} href={href} className="flex min-h-11 items-center underline underline-offset-4">{label}</Link>)}
          </p>
        </div>
      </div>
      <p aria-hidden="true" className="display pointer-events-none mx-auto max-w-[1440px] overflow-hidden px-5 text-center text-[clamp(5rem,26vw,22rem)] leading-[.78] tracking-tight select-none max-md:hidden md:px-10"><span className="relative inline-block" style={{ letterSpacing: "-0.06em", backgroundImage: "linear-gradient(180deg, color-mix(in srgb, var(--on-deep) 26%, transparent), transparent 85%)", WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent" }}>orbı
        <OrbiAccent className="absolute text-[color-mix(in_srgb,#1166FF_70%,transparent)]" style={{ width: ".36em", right: "-.06em", top: "-.02em" }} /></span></p>
      <div className="pb-8" />
    </footer>
  );
}

function FooterCol({ title, links }: FooterGroup) {
  return (
    <div className="max-md:hidden">
      <p className="mb-3 text-sm font-semibold text-on-deep-muted">{title}</p>
      <ul className="space-y-2 max-md:space-y-0">
        {links.map(([label, href]) => <li key={href}><Link href={href} className="hover:underline max-md:flex max-md:min-h-11 max-md:items-center">{label}</Link></li>)}
      </ul>
    </div>
  );
}
