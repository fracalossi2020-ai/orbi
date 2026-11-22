/**
 * Planos do motorista no Clube Orbi: o que cada um inclui e os termos de uso.
 * Preço e comissão de cada plano ficam no banco (editáveis no painel); aqui ficam os valores iniciais,
 * a lista de benefícios e as regras, ligados ao plano pelo campo `tier`.
 *
 * Modelo: a Orbi não paga conserto. O motorista ganha desconto nas oficinas parceiras (a oficina dá o desconto
 * em troca dos clientes que a Orbi leva) e, nos planos maiores, um crédito mensal com limite que a Orbi paga.
 * Assim o custo da Orbi tem teto e o plano não vira seguro (que é regulado pela SUSEP).
 */

export type PlanTier = "basico" | "plus" | "pro";

export type PlanSpec = {
  tier: PlanTier;
  name: string;
  tagline: string;
  /** Valores iniciais; o painel pode mudar preço e comissão depois. */
  priceCents: number;
  commissionBps: number;
  /** Desconto na mão de obra e nas peças nas oficinas parceiras (em pontos-base: 1000 = 10%). */
  laborDiscountBps: number;
  partsDiscountBps: number;
  /** Crédito por ciclo de 30 dias para usar em oficina parceira, pago pela Orbi. Não acumula. */
  monthlyCreditCents: number;
  /** Check-up preventivo gratuito na oficina parceira, a cada N dias. */
  checkupEveryDays: number;
  benefits: string[];
  /** Regras só deste plano (as gerais valem para todos). */
  terms: string[];
};

export const PLAN_SPECS: PlanSpec[] = [
  {
    tier: "basico",
    name: "Orbi Básico",
    tagline: "Para manter o carro em dia gastando menos.",
    priceCents: 9900,
    commissionBps: 1500,
    laborDiscountBps: 1000,
    partsDiscountBps: 0,
    monthlyCreditCents: 0,
    checkupEveryDays: 180,
    benefits: [
      "10% de desconto na mão de obra das oficinas parceiras",
      "Check-up preventivo grátis a cada 6 meses",
      "Alinhamento e balanceamento com desconto",
      "10% de desconto em guincho e borracharia parceiros",
      "Desconto em lavagem e no posto parceiro, quando houver",
    ],
    terms: [
      "A comissão continua a da tarifa da sua cidade.",
      "O check-up gratuito vale uma vez a cada 6 meses, para o veículo cadastrado.",
    ],
  },
  {
    tier: "plus",
    name: "Orbi Plus",
    tagline: "Desconto maior, crédito todo mês e comissão menor.",
    priceCents: 16900,
    commissionBps: 1400,
    laborDiscountBps: 1500,
    partsDiscountBps: 500,
    monthlyCreditCents: 4000,
    checkupEveryDays: 90,
    benefits: [
      "Comissão de 14% (1 ponto a menos) nas corridas",
      "15% na mão de obra e 5% nas peças nas oficinas parceiras",
      "R$ 40 de crédito por mês para usar em oficina parceira",
      "Check-up preventivo grátis a cada 3 meses",
      "20% de desconto em guincho e borracharia parceiros",
      "Desconto em lavagem e no posto parceiro, quando houver",
    ],
    terms: [
      "O crédito de R$ 40 vale por ciclo de 30 dias, não acumula e não vira dinheiro.",
      "O check-up gratuito vale uma vez a cada 3 meses, para o veículo cadastrado.",
    ],
  },
  {
    tier: "pro",
    name: "Orbi Pro",
    tagline: "Tudo do Plus e muito mais, para quem vive da estrada.",
    priceCents: 28900,
    commissionBps: 1200,
    laborDiscountBps: 2000,
    partsDiscountBps: 1000,
    monthlyCreditCents: 10000,
    checkupEveryDays: 30,
    benefits: [
      "Comissão de 12% (3 pontos a menos) nas corridas",
      "20% na mão de obra e 10% nas peças nas oficinas parceiras",
      "R$ 100 de crédito por mês para usar em oficina parceira",
      "Check-up preventivo grátis todo mês",
      "1 guincho por mês pago pela Orbi, até 30 km, com parceiro",
      "Encaixe prioritário na oficina parceira (atendimento em até 1 dia útil)",
      "Troca de óleo com preço fechado e alinhamento grátis a cada 3 meses",
      "1 consulta por ano com contador parceiro (MEI e Imposto de Renda)",
      "Suporte prioritário da Orbi",
    ],
    terms: [
      "O crédito de R$ 100 vale por ciclo de 30 dias, não acumula e não vira dinheiro.",
      "O guincho pago pela Orbi vale uma vez por ciclo, até 30 km, só com guincho parceiro chamado pelo suporte; o que passar de 30 km é pago pelo motorista.",
      "O encaixe prioritário depende da agenda da oficina; a Orbi não garante prazo de conserto.",
      "A consulta com contador é de orientação; o serviço contábil completo é contratado à parte.",
    ],
  },
];

/** Regras que valem para todos os planos. Rascunho: revisar com advogado antes de cobrar de verdade. */
export const PLAN_GENERAL_TERMS: { title: string; items: string[] }[] = [
  { title: "O que é o plano", items: [
    "É uma assinatura de vantagens do Clube Orbi para motoristas aprovados. Não é seguro, proteção veicular nem garantia mecânica.",
    "A Orbi não conserta carros nem responde pelo serviço da oficina. Ela negocia descontos e, nos planos com crédito, paga uma parte do serviço até o limite do plano.",
  ] },
  { title: "Pagamento e duração", items: [
    "Cada assinatura vale 30 dias a partir do pagamento, descontado do seu saldo na Orbi.",
    "Não há renovação automática: para continuar, assine de novo antes de vencer.",
    "A comissão do plano vale para as corridas concluídas enquanto ele está ativo, e só reduz a comissão da tarifa da cidade: nunca a aumenta.",
  ] },
  { title: "Como usar nas oficinas", items: [
    "Mostre na oficina parceira a tela do Clube Orbi com o plano ativo. O desconto vale só para o veículo cadastrado na sua conta.",
    "Descontos e crédito valem só em parceiros listados no app. A lista pode mudar; benefícios de parceiros dependem de parceiros ativos na sua cidade.",
    "Peças, prazos e garantia do serviço são de responsabilidade da oficina, que segue o Código de Defesa do Consumidor (garantia legal de 90 dias para serviços).",
    "O crédito é pago pela Orbi direto à oficina; o que passar do limite é pago por você.",
  ] },
  { title: "Cancelamento", items: [
    "Você pode desistir em até 7 dias após assinar e recebe o valor de volta no saldo, se ainda não usou nenhum benefício.",
    "Depois disso, pode cancelar quando quiser: o plano fica ativo até o fim dos 30 dias, sem devolução proporcional.",
  ] },
  { title: "Uso indevido", items: [
    "Usar o plano em outro veículo, emprestar a conta ou combinar valores falsos com a oficina leva ao cancelamento do plano sem devolução e pode suspender a conta.",
  ] },
  { title: "Mudanças", items: [
    "A Orbi pode mudar preços e benefícios avisando com 30 dias de antecedência. Quem já pagou mantém as condições até o fim do período.",
  ] },
];

export const planSpec = (tier: string | null | undefined) => PLAN_SPECS.find((p) => p.tier === tier) ?? null;
