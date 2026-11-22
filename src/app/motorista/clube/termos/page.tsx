import Link from "next/link";
import { PageTitle } from "@/frontend/components/app/AppShell";
import { Icon } from "@/frontend/components/Icon";
import { PLAN_GENERAL_TERMS, PLAN_SPECS } from "@/shared/plans";
import { brl } from "@/shared/pricing";

export const metadata = { title: "Termos dos planos · Orbi" };

/** Termos dos planos do motorista: regras gerais e o que vale só em cada plano. */
export default function PlanTermsPage() {
  return (
    <>
      <Link href="/motorista/clube" className="mb-4 inline-flex items-center gap-2 text-sm font-semibold"><Icon name="back" size={18} />Clube Orbi</Link>
      <PageTitle sub="Leia antes de assinar. Ao assinar um plano, você concorda com estas regras.">Termos dos planos</PageTitle>

      <div className="space-y-6">
        {PLAN_GENERAL_TERMS.map((g, i) => (
          <section key={g.title} className="card p-5">
            <h2 className="display text-xl">{i + 1}. {g.title}</h2>
            <ul className="mt-3 list-disc space-y-2 pl-5 text-sm">{g.items.map((t) => <li key={t}>{t}</li>)}</ul>
          </section>
        ))}

        <section>
          <h2 className="display mb-3 text-2xl">Regras de cada plano</h2>
          <div className="grid gap-3 lg:grid-cols-3">
            {PLAN_SPECS.map((p) => (
              <div key={p.tier} className="card p-5">
                <p className="display text-xl">{p.name}</p>
                <p className="num text-sm text-muted">{brl(p.priceCents)} a cada 30 dias (valor de lançamento; o valor cobrado é o mostrado na hora de assinar)</p>
                <ul className="mt-3 list-disc space-y-2 pl-5 text-sm">{p.terms.map((t) => <li key={t}>{t}</li>)}</ul>
              </div>
            ))}
          </div>
        </section>
      </div>
    </>
  );
}
