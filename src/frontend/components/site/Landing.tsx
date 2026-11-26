"use client";
import Link from "next/link";
import { Icon } from "@/frontend/components/Icon";
import type { Faq } from "@/frontend/lib/home-faq";
import { socialLinks } from "@/frontend/lib/social";
import { Reveal } from "./Fx";
import { useSupport } from "./usePublic";

/**
 * A home em três partes, sobre o branco do site (as partes escuras são painéis arredondados):
 * 1. O que é: o hero e, logo abaixo, os três passos (ConceptStrip).
 * 2. No app: o convite para usar o app (FinalCta) e a parte de motoristas.
 * 3. Dúvidas: perguntas e respostas, redes sociais e contato (HomeFaq).
 */

const STEPS: [string, string, string][] = [
  ["pin", "Diga para onde vai", "Partida pelo GPS, destino pela busca."],
  ["receipt", "Veja o preço e confirme", "O valor aparece antes. Você só pede se quiser."],
  ["car", "Um motorista da região te busca", "Nome, foto, carro e placa na tela."],
];

/** Parte 1, continuação do hero: o conceito em três passos, sem mudar o fundo. */
export function ConceptStrip() {
  return (
    <section id="o-que-e" aria-label="Como a Orbi funciona" className="relative bg-bg text-ink">
      <div className="mx-auto max-w-[1440px] px-5 pb-6 md:px-10 md:pb-16">
        {/* Celular: três linhas simples, sem caixas e sem a frase de apoio (uma ideia por tela). */}
        <ol className="grid gap-3 max-md:gap-0 max-md:divide-y max-md:divide-line md:grid-cols-3">
          {STEPS.map(([icon, title, text], i) => (
            <Reveal as="li" key={title} delay={i * .06} className="flex items-start gap-4 rounded-[22px] border border-line bg-surface p-5 max-md:items-center max-md:rounded-none max-md:border-0 max-md:bg-transparent max-md:px-0 max-md:py-3.5">
              <span className="grid size-11 shrink-0 max-md:size-10 place-items-center rounded-2xl bg-[color-mix(in_srgb,var(--primary)_10%,transparent)] text-primary"><Icon name={icon} size={22} weight="duotone" /></span>
              <span>
                <span className="block font-semibold">{i + 1}. {title}</span>
                <span className="mt-0.5 block text-sm text-muted max-md:hidden">{text}</span>
              </span>
            </Reveal>
          ))}
        </ol>
      </div>
    </section>
  );
}

/** Parte 3: perguntas e respostas, redes sociais e contato. */
export function HomeFaq({ items }: { items: Faq[] }) {
  const support = useSupport();
  const social = socialLinks();
  const whatsapp = support?.whatsapp ? `https://wa.me/${support.whatsapp}?text=${encodeURIComponent("Olá, Orbi!")}` : "";
  return (
    <section id="duvidas" aria-labelledby="duvidas-titulo" className="scroll-mt-20 bg-bg text-ink">
      <div className="mx-auto grid max-w-[1440px] items-center gap-6 px-5 py-10 md:gap-12 md:px-10 md:py-28 lg:grid-cols-[1fr_1.35fr] lg:gap-20">
        <Reveal className="mx-auto max-w-xl text-center lg:mx-0 lg:text-left">
          <p className="mono-label text-brand">Dúvidas</p>
          <h2 id="duvidas-titulo" className="display mt-3 text-[2rem] leading-[.95] md:mt-4 md:text-[clamp(2.8rem,5.6vw,5.2rem)]">Perguntas frequentes.</h2>
          <p className="mt-3 text-base text-muted max-md:hidden md:mt-6 md:text-xl">Não achou? Veja a <Link href="/ajuda" className="font-semibold text-primary underline underline-offset-4">central de ajuda</Link> ou fale com a gente.</p>
          <ul className="mt-6 flex flex-wrap justify-center gap-2 max-md:hidden md:mt-8 lg:justify-start" aria-label="Redes sociais e contato">
            {whatsapp && (
              <li><a href={whatsapp} target="_blank" rel="noopener noreferrer" className="btn btn-lg btn-primary"><Icon name="whatsapp" size={20} /> WhatsApp</a></li>
            )}
            {social.map((s) => (
              <li key={s.id}>
                <a href={s.href} target={s.id === "email" ? undefined : "_blank"} rel="noopener noreferrer" className="btn btn-lg btn-ghost"><Icon name={s.icon} size={20} /> {s.label}</a>
              </li>
            ))}
            {!whatsapp && !social.length && <li><Link href="/contato" className="btn btn-lg btn-ghost"><Icon name="chat" size={20} /> Fale conosco</Link></li>}
          </ul>
        </Reveal>

        <div className="border-t border-line">
          {items.map((f, i) => (
            <details key={f.q} className={`faq-item group border-b border-line ${i >= 4 ? "max-md:hidden" : ""}`}>
              <summary className="flex cursor-pointer list-none items-center gap-4 py-4 text-base font-semibold transition-colors group-open:text-primary md:py-6 md:text-xl [&::-webkit-details-marker]:hidden">
                <span className="num w-7 shrink-0 text-sm font-medium text-muted group-open:text-primary max-md:hidden">{String(i + 1).padStart(2, "0")}</span>
                <span className="flex-1">{f.q}</span>
                <span className="grid size-9 shrink-0 place-items-center rounded-full bg-surface-2 text-ink transition-[transform,background-color,color] duration-300 group-open:rotate-45 group-open:bg-primary group-open:text-white"><Icon name="plus" size={18} /></span>
              </summary>
              <p className="faq-answer mb-5 max-w-[56ch] border-l-2 border-primary pl-4 text-base leading-snug text-ink md:mb-6 md:ml-11 md:pl-5 md:text-xl">{f.a}</p>
            </details>
          ))}
          {/* Celular: 4 perguntas e a porta para o resto. */}
          <div className="mt-6 grid gap-2 md:hidden">
            <Link href="/ajuda" className="btn btn-lg btn-ghost">Ver todas as perguntas</Link>
            {whatsapp && <a href={whatsapp} target="_blank" rel="noopener noreferrer" className="btn btn-lg btn-primary"><Icon name="whatsapp" size={20} /> Falar no WhatsApp</a>}
          </div>
        </div>
      </div>
    </section>
  );
}
