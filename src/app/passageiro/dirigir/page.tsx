"use client";
import { useEffect, useState } from "react";
import { Icon } from "@/frontend/components/Icon";
import { api, ErrorNote, Spinner, useAction } from "@/frontend/components/ui";
import { MotoSoon } from "@/frontend/components/MotoSoon";
import { skipNextSplash } from "@/frontend/lib/splash";
import { DEFAULT_DRIVER_RULES, type DriverRules } from "@/shared/driver-rules";

/** O que muda para quem dirige com a Orbi, em poucas linhas. */
const PERKS = [
  { icon: "wallet", title: "Ganho claro antes de aceitar", text: "Cada oferta mostra o valor da corrida, a comissão da Orbi e quanto fica com você." },
  { icon: "scale", title: "Distribuição equilibrada", text: "Não é só quem está mais perto: quem ficou mais tempo parado ou ganhou menos no dia também sobe na fila." },
  { icon: "gift", title: "Clube Orbi", text: "Descontos em parceiros da cidade, como oficinas, borracharias e lava-jatos." },
];

/**
 * "Seja motorista Orbi": a conta de passageiro vira conta de motorista com um toque
 * e segue para o cadastro (documentos e veículo) em /motorista.
 */
export default function BecomeDriverPage() {
  const [ready, setReady] = useState(false);
  const [rules, setRules] = useState<DriverRules>(DEFAULT_DRIVER_RULES);
  const { busy, error, run } = useAction();

  useEffect(() => {
    let live = true;
    // Quem já é motorista (aprovado ou em cadastro) vai direto para o app do motorista.
    api<{ user: { role: string } | null }>("/api/me")
      .then((r) => { if (!live) return; if (r.user?.role === "driver") { skipNextSplash(); window.location.replace("/motorista"); } else setReady(true); })
      .catch(() => { if (live) setReady(true); });
    api<DriverRules>("/api/public/driver-rules").then((r) => { if (live) setRules(r); }).catch(() => {});
    return () => { live = false; };
  }, []);

  const become = () => run(async () => {
    await api("/api/account/become-driver", { body: {} });
    skipNextSplash();
    window.location.href = "/motorista";
  });

  if (!ready) return <Spinner />;

  const oldestCar = new Date().getFullYear() - rules.maxVehicleAge;
  const requirements = [
    `${rules.minAge} anos ou mais`,
    `CNH categoria B ou superior com a observação EAR (exerce atividade remunerada)${rules.minLicenseYears ? `, com ${rules.minLicenseYears} ${rules.minLicenseYears === 1 ? "ano" : "anos"} de habilitação` : ""}`,
    `Carro de ${oldestCar} ou mais novo, com ${rules.minDoors} portas${rules.requireAirConditioning ? " e ar-condicionado" : ""}`,
    "Certidão de antecedentes criminais e inscrição no INSS",
  ];
  // Nesta etapa o cadastro é só de carro; a moto aparece no bloco "Orbi Moto: em breve".

  return (
    <div className="space-y-5">
      {/* Painel azul claro do site: fica igual no tema claro e no escuro. */}
      <section className="rounded-[32px] bg-tint p-6 text-ink md:p-10" aria-labelledby="dirigir-titulo">
        <p className="text-sm font-semibold text-brand">Dirigir com a Orbi</p>
        <h1 id="dirigir-titulo" className="display mt-2 text-[2.5rem] leading-[0.95] md:text-6xl">Seja motorista Orbi</h1>
        <p className="mt-4 max-w-xl text-ink/70">Use a mesma conta: você continua pedindo viagens como passageiro e, quando quiser, fica online para receber corridas.</p>
        <button type="button" className="btn btn-primary btn-lg mt-6 w-full sm:w-auto" disabled={busy} onClick={become}>
          {busy ? "Abrindo o cadastro…" : "Quero ser motorista"}<Icon name="arrow" size={18} />
        </button>
        <div className="mt-3"><ErrorNote>{error}</ErrorNote></div>
      </section>

      <section aria-labelledby="dirigir-muda">
        <h2 id="dirigir-muda" className="display mb-3 text-2xl">O que muda com a Orbi</h2>
        <ul className="grid gap-3 md:grid-cols-3">
          {PERKS.map((p) => (
            <li key={p.title} className="rounded-[26px] border border-line bg-surface p-5">
              <span className="grid size-11 place-items-center rounded-full bg-tint text-brand"><Icon name={p.icon} size={22} /></span>
              <p className="mt-3 font-semibold">{p.title}</p>
              <p className="mt-1 text-sm text-muted">{p.text}</p>
            </li>
          ))}
        </ul>
      </section>

      <section className="rounded-[26px] border border-line bg-surface p-5 md:p-6" aria-labelledby="dirigir-requisitos">
        <h2 id="dirigir-requisitos" className="display text-2xl">Requisitos principais</h2>
        <ul className="mt-3 space-y-2">
          {requirements.map((r) => (
            <li key={r} className="flex gap-2.5 text-sm"><span className="mt-0.5 text-brand"><Icon name="check" size={18} /></span>{r}</li>
          ))}
        </ul>
        <p className="mt-4 text-sm text-muted">No próximo passo você envia os documentos e os dados do veículo. A equipe analisa e avisa por aqui.</p>
        <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-sm font-semibold">
          <a className="underline" href="/motoristas/requisitos" target="_blank" rel="noreferrer">Ver todos os requisitos</a>
          <a className="underline" href="/termos-motorista" target="_blank" rel="noreferrer">Termos do motorista</a>
        </div>
      </section>

      <MotoSoon account />
    </div>
  );
}
