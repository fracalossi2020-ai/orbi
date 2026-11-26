import { Icon } from "@/frontend/components/Icon";

/** Cabeçalho de página, no branco como a abertura da home: rótulo, título grande e, se houver, um elemento visual ao lado. */
export function PageHead({ title, lead, eyebrow, visual, children }: { title: string; lead?: string; eyebrow?: string; visual?: React.ReactNode; children?: React.ReactNode }) {
  return (
    <section className="hero-light on-deep relative isolate overflow-hidden bg-deep pt-10 pb-8 text-on-deep md:pt-16 md:pb-14">
      <div className={`mx-auto max-w-[1440px] px-5 md:px-10 ${visual ? "grid items-center gap-8 md:gap-12 lg:grid-cols-[1.1fr_1fr]" : ""}`}>
        <div>
          {eyebrow && <p className="mono-label text-brand">{eyebrow}</p>}
          <h1 className={`display max-w-[16ch] text-[clamp(2.1rem,6vw,5.4rem)] ${eyebrow ? "mt-3 md:mt-4" : ""}`}>{title}</h1>
          {lead && <p className="mt-4 max-w-2xl text-base text-on-deep-muted md:mt-6 md:text-xl">{lead}</p>}
          {children && <div className="mt-6 flex flex-col gap-3 max-md:[&>*:not(:first-child)]:hidden! md:mt-9 sm:flex-row">{children}</div>}
        </div>
        {visual && <div className="min-w-0 max-md:hidden">{visual}</div>}
      </div>
    </section>
  );
}

export function Body({ children, narrow }: { children: React.ReactNode; narrow?: boolean }) {
  return <div className={`mx-auto px-5 py-10 md:px-10 md:py-24 ${narrow ? "max-w-3xl" : "max-w-[1440px]"}`}>{children}</div>;
}

/** Seção escura, no mesmo tom da abertura. */
export function Dark({ children, className = "", id }: { children: React.ReactNode; className?: string; id?: string }) {
  return (
    <section id={id} className={`on-deep bg-deep text-on-deep ${className}`}>
      <div className="mx-auto max-w-[1440px] px-5 py-8 md:px-10 md:py-24">{children}</div>
    </section>
  );
}

export type Feature = [icon: string, title: string, text: string];

/** Grade de recursos em cartões de vidro. O primeiro ocupa duas colunas quando há espaço. */
export function Features({ items }: { items: Feature[] }) {
  return (
    <ul className="grid gap-4 max-md:gap-0 max-md:divide-y max-md:divide-[color-mix(in_srgb,var(--on-deep)_14%,transparent)] md:grid-cols-2 lg:grid-cols-3">
      {/* Celular: lista simples, só os quatro primeiros (o resto está na central de ajuda). */}
      {items.map(([icon, title, text], i) => (
        <li key={title} data-glow className={`glass-deep rounded-[28px] p-6 max-md:rounded-none max-md:border-0 max-md:bg-transparent max-md:px-0 max-md:py-5 max-md:shadow-none max-md:backdrop-blur-none md:p-7 ${i === 0 ? "lg:col-span-2" : ""} ${i >= 4 ? "max-md:hidden" : ""}`}>
          <span className="grid size-12 place-items-center rounded-2xl bg-[color-mix(in_srgb,var(--mark)_16%,transparent)] text-[var(--mark)] max-md:size-10"><Icon name={icon} size={26} weight="duotone" /></span>
          <h2 className="display mt-6 text-2xl max-md:mt-3 max-md:text-xl md:text-[1.7rem]">{title}</h2>
          <p className="mt-2 max-w-[52ch] text-on-deep-muted max-md:text-[15px]">{text}</p>
        </li>
      ))}
    </ul>
  );
}

export function Steps({ items }: { items: { title: string; text: string }[] }) {
  return (
    <ol className="grid gap-4 max-md:gap-0 max-md:divide-y max-md:divide-[color-mix(in_srgb,var(--on-deep)_14%,transparent)] md:grid-cols-2 lg:grid-cols-4">
      {items.map((s, i) => (
        <li key={s.title} data-glow className="glass-deep rounded-[28px] p-6 max-md:rounded-none max-md:border-0 max-md:bg-transparent max-md:px-0 max-md:py-4 max-md:shadow-none max-md:backdrop-blur-none">
          <span className="mono-label text-[var(--mark)] max-md:hidden">Passo {i + 1} de {items.length}</span>
          <h3 className="display mt-6 text-2xl max-md:mt-0 max-md:text-lg"><span className="md:hidden">{i + 1}. </span>{s.title}</h3>
          <p className="mt-2 text-on-deep-muted max-md:mt-1 max-md:text-[15px]">{s.text}</p>
        </li>
      ))}
    </ol>
  );
}

export function Legal({ children }: { children: React.ReactNode }) {
  return <div className="space-y-5 leading-relaxed [&_h2]:display [&_h2]:mt-10 [&_h2]:text-2xl [&_li]:ml-5 [&_li]:list-disc [&_ul]:space-y-1">{children}</div>;
}
