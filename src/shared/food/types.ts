/** Tipos do Orbi Food (demonstração). Valores em centavos. */

export type OptionChoice = { id: string; label: string; extraCents: number };
/** Grupo de opcionais de um item. max = 1 é escolha única; max > 1 é múltipla (até max). required: precisa escolher ao menos uma. */
export type OptionGroup = { id: string; label: string; required: boolean; max: number; options: OptionChoice[] };

export type FoodItem = { id: string; section: string; name: string; description: string; priceCents: number; groups?: OptionGroup[] };

/** Turno de funcionamento, "HH:MM". */
export type Turn = { open: string; close: string };

export type FoodCityId = "ipatinga" | "fabriciano" | "timoteo";
export type FoodCategoryId = "pizza" | "lanches" | "marmita" | "acai" | "japones" | "padaria" | "espetinho";
export type CoverTone = 0 | 1 | 2 | 3;

export type FoodStore = {
  id: string; name: string; city: FoodCityId; category: FoodCategoryId; blurb: string;
  etaMin: number; etaMax: number;
  /** Taxa de entrega da própria loja. null: a loja só faz retirada. */
  deliveryFeeCents: number | null;
  minOrderCents: number;
  turns: Turn[];
  tone: CoverTone;
  /** Números fictícios do dia, só para o painel da equipe. */
  today: { orders: number; ticketCents: number };
  menu: FoodItem[];
};

export type Fulfillment = "pickup" | "delivery";
export type PaymentChoice = "pix" | "cash";

export type FoodStatus = "pending" | "accepted" | "preparing" | "ready" | "delivered" | "picked_up" | "cancelled";

/** Opcional escolhido, já com o nome e o preço da hora da escolha. */
export type ChosenOption = { groupId: string; optionId: string; label: string; extraCents: number };
export type CartLine = { key: string; itemId: string; name: string; baseCents: number; options: ChosenOption[]; qty: number };
