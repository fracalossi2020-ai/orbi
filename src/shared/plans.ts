/**
 * Clube Orbi do motorista: o nível grátis (que todo motorista aprovado já tem) e os planos pagos Plus e Pro.
 * Preço e comissão de cada plano ficam no banco (editáveis no painel); aqui ficam os valores iniciais,
 * a lista de benefícios e as regras, ligados ao plano pelo campo `tier`.
 *
 * Modelo: a Orbi não paga conserto no nível grátis. O motorista ganha desconto nas oficinas parceiras (a oficina
 * dá o desconto em troca dos clientes que a Orbi leva) e, nos planos pagos (desligados no lançamento), um crédito
 * mensal com limite que a Orbi paga. Assim o custo da Orbi tem teto e o plano não vira seguro (regulado pela SUSEP).
 */

export type PlanTier = "plus" | "pro";

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

/**
 * Nível grátis do Clube: todo motorista aprovado já tem, sem cobrança. Não é um plano no banco:
 * o desconto vem de cada oficina parceira (que dá o desconto em troca dos clientes que a Orbi leva).
 */
export const FREE_TIER = {
  name: "Clube Orbi grátis",
  tagline: "Já está valendo para você, sem pagar nada.",
  benefits: [
    "Ver todas as oficinas parceiras da sua cidade",
    "Desconto de cada parceira, normalmente de 5% a 10% na mão de obra",
    "Check-up grátis 1 vez por ano, quando a parceira oferecer",
    "Desconto em guincho e borracharia parceiros",
  ],
  terms: [
    "O desconto é dado pela oficina parceira, não pela Orbi. O valor e as regras podem variar de uma parceira para outra.",
    "A Orbi não cobra nada por este nível e não paga parte do serviço.",
  ],
};

/**
 * Planos pagos (Plus e Pro): ficam DESLIGADOS no lançamento. O crédito mensal e o guincho ainda não existem no
 * sistema, e falta o código/QR para a oficina validar o uso. Só ligar (campo "Ativo" no painel) depois disso
 * e com 40 a 60 motoristas ativos. O Básico pago deixou de existir: tinha a mesma comissão de quem não assina.
 */
export const PAID_PLANS_ENABLED_AT_LAUNCH = false;

export const PLAN_SPECS: PlanSpec[] = [
  {
    tier: "plus",
    name: "Orbi Plus",
    tagline: "Desconto maior, crédito todo mês e comissão menor.",
    priceCents: 12900,
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
      "20% de desconto em guincho parceiro",
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
    commissionBps: 1300,
    laborDiscountBps: 2000,
    partsDiscountBps: 1000,
    monthlyCreditCents: 8000,
    checkupEveryDays: 30,
    benefits: [
      "Comissão de 13% (2 pontos a menos) nas corridas",
      "20% na mão de obra e 10% nas peças nas oficinas parceiras",
      "R$ 80 de crédito por mês para usar em oficina parceira",
      "Check-up preventivo grátis todo mês",
      "1 guincho por mês pago pela Orbi, até R$ 150, com parceiro",
      "Encaixe prioritário na oficina parceira (atendimento em até 1 dia útil)",
      "Alinhamento grátis a cada 3 meses",
      "1 consulta por ano com contador parceiro (MEI e Imposto de Renda)",
      "Suporte prioritário da Orbi",
    ],
    terms: [
      "O crédito de R$ 80 vale por ciclo de 30 dias, não acumula e não vira dinheiro.",
      "O guincho pago pela Orbi vale uma vez por ciclo, até R$ 150 (e até 30 km), só com guincho parceiro chamado pelo suporte; o que passar disso é pago pelo motorista.",
      "O encaixe prioritário depende da agenda da oficina; a Orbi não garante prazo de conserto.",
      "A consulta com contador é de orientação; o serviço contábil completo é contratado à parte.",
    ],
  },
];

/** Regras que valem para todos os planos. Rascunho: revisar com advogado antes de cobrar de verdade. */
export const PLAN_GENERAL_TERMS: { title: string; items: string[] }[] = [
  { title: "O que é o Clube", items: [
    "O nível grátis do Clube Orbi vale para todo motorista aprovado e não custa nada. Os planos pagos (Plus e Pro) ainda não estão à venda; as regras abaixo valem para quando forem abertos.",
    "Não é seguro, proteção veicular nem garantia mecânica.",
    "A Orbi não conserta carros nem responde pelo serviço da oficina. Ela negocia descontos com as parceiras e, nos planos pagos com crédito (quando estiverem disponíveis), paga uma parte do serviço até o limite do plano.",
  ] },
  { title: "Pagamento e duração (planos pagos)", items: [
    "Cada assinatura vale 30 dias a partir do pagamento, descontado do seu saldo na Orbi.",
    "Não há renovação automática: para continuar, assine de novo antes de vencer.",
    "A comissão do plano vale para as corridas concluídas enquanto ele está ativo, e só reduz a comissão da tarifa da cidade: nunca a aumenta.",
  ] },
  { title: "Como usar nas oficinas", items: [
    "Mostre na oficina parceira a tela do Clube Orbi. O desconto vale só para o veículo cadastrado na sua conta.",
    "Descontos e crédito valem só em parceiros listados no app. A lista pode mudar; benefícios de parceiros dependem de parceiros ativos na sua cidade.",
    "Peças, prazos e garantia do serviço são de responsabilidade da oficina, que segue o Código de Defesa do Consumidor (garantia legal de 90 dias para serviços).",
    "O crédito dos planos pagos é pago pela Orbi direto à oficina; o que passar do limite é pago por você.",
  ] },
  { title: "Cancelamento (planos pagos)", items: [
    "Você pode desistir em até 7 dias após assinar e recebe o valor de volta no saldo, se ainda não usou nenhum benefício.",
    "Depois disso, pode cancelar quando quiser: o plano fica ativo até o fim dos 30 dias, sem devolução proporcional.",
  ] },
  { title: "Uso indevido", items: [
    "Usar o Clube em outro veículo, emprestar a conta ou combinar valores falsos com a oficina leva ao cancelamento dos benefícios sem devolução e pode suspender a conta.",
  ] },
  { title: "Mudanças", items: [
    "A Orbi pode mudar preços e benefícios avisando com 30 dias de antecedência. Quem já pagou mantém as condições até o fim do período.",
  ] },
];

export const planSpec = (tier: string | null | undefined) => PLAN_SPECS.find((p) => p.tier === tier) ?? null;

/** Quem tenta assinar: null se pode; senão o erro (404 se não existe, 409 se está desligado). */
export function planSubscribeError(plan: { active: boolean } | null | undefined): { status: number; message: string } | null {
  if (!plan) return { status: 404, message: "Plano não encontrado." };
  if (!plan.active) return { status: 409, message: "Este plano ainda não está disponível." };
  return null;
}
