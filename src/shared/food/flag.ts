/**
 * Interruptor do Orbi Food (demonstração). Lido em tempo de execução no servidor (não é NEXT_PUBLIC): quem roda `next start`
 * liga com PRUMO_FOOD_DEMO=true sem refazer o build. Sem ele, a aba e as páginas Food não existem (404).
 * Booleano estrito: só a string "true" liga. NÃO entra em runtimeConfigProblems: em produção de verdade a demo pode ficar ligada,
 * e por isso todas as telas Food mostram a faixa de demonstração.
 */
export const foodDemoOn = (env: Record<string, string | undefined>) => env.PRUMO_FOOD_DEMO === "true";

/** Texto fixo da faixa que aparece em TODAS as telas do Food. */
export const FOOD_DEMO_BANNER = "DEMONSTRAÇÃO · dados fictícios";

/** Tipo gravado em `leads` pelo botão "Quero minha loja no Orbi Food" (sem migração, como o da moto). */
export const FOOD_LEAD_KIND = "food";
export const FOOD_LEAD_MESSAGE = "Orbi Food: quer a loja no Orbi Food quando abrir.";
