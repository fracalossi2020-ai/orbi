import type { CoverTone, FoodCategoryId, FoodCityId, FoodItem, FoodStatus, FoodStore, Fulfillment, OptionGroup } from "./types";

/**
 * Dados FICTÍCIOS do Orbi Food (demonstração). Arquivo estático, sem banco e sem API de escrita.
 * Lojas, cardápios e números do dia são inventados; nenhum pedido ou pagamento é real.
 */

export const FOOD_CITIES: { id: FoodCityId; name: string }[] = [
  { id: "ipatinga", name: "Ipatinga" },
  { id: "fabriciano", name: "Coronel Fabriciano" },
  { id: "timoteo", name: "Timóteo" },
];

export const FOOD_CATEGORIES: { id: FoodCategoryId; label: string }[] = [
  { id: "pizza", label: "Pizza" }, { id: "lanches", label: "Lanches" }, { id: "marmita", label: "Marmita" }, { id: "acai", label: "Açaí" },
  { id: "japones", label: "Japonês" }, { id: "padaria", label: "Padaria" }, { id: "espetinho", label: "Espetinho" },
];

/**
 * Tabela de comissões (pontos-base sobre o subtotal dos itens). Decisão do dono: 14% TUDO INCLUÍDO na entrega própria do
 * restaurante (o pagamento online já está incluso: sem mensalidade e sem taxa extra). Entrega Orbi: "em breve", sem número
 * na demo (não existe entregador Orbi na fase 1). O percentual nunca fica nas regras puras: quem calcula recebe daqui.
 */
export const FOOD_COMMISSIONS: { id: "own_delivery" | "pickup" | "orbi_delivery"; label: string; bps: number | null; soon?: boolean; note: string }[] = [
  { id: "own_delivery", label: "Entrega própria do restaurante", bps: 1400, note: "Tudo incluído: pagamento online, sem mensalidade" },
  { id: "pickup", label: "Retirada no balcão", bps: 1400, note: "Tudo incluído: pagamento online, sem mensalidade" },
  { id: "orbi_delivery", label: "Entrega Orbi", bps: null, soon: true, note: "Em breve" },
];

export const commissionBpsFor = (f: Fulfillment) => FOOD_COMMISSIONS.find((c) => c.id === (f === "delivery" ? "own_delivery" : "pickup"))!.bps as number;

/** Comissão do Orbi Food usada pela calculadora e pelo resumo do dia (entrega própria, tudo incluído). */
export const ORBI_FOOD_BPS = FOOD_COMMISSIONS[0].bps as number;

// ------------------------------------------------------------------ montagem dos cardápios

const c = (reais: number) => Math.round(reais * 100);
const opt = (id: string, label: string, extra = 0) => ({ id, label, extraCents: c(extra) });
const group = (id: string, label: string, required: boolean, max: number, options: ReturnType<typeof opt>[]): OptionGroup => ({ id, label, required, max, options });
const item = (id: string, section: string, name: string, price: number, description: string, groups?: OptionGroup[]): FoodItem =>
  ({ id, section, name, description, priceCents: c(price), ...(groups ? { groups } : {}) });

// Pizzaria
const massa = group("massa", "Massa", true, 1, [opt("trad", "Tradicional"), opt("int", "Integral", 3)]);
const borda = group("borda", "Borda recheada", false, 1, [opt("catu", "Catupiry", 8), opt("ched", "Cheddar", 8), opt("choc", "Chocolate", 9)]);
const extrasPizza = group("extras", "Adicionais", false, 3, [opt("bacon", "Bacon", 6), opt("azeit", "Azeitona", 3), opt("cebola", "Cebola", 2.5), opt("oreg", "Orégano extra", 0)]);
const refri2l = group("sabor", "Sabor", true, 1, [opt("cola", "Cola"), opt("guar", "Guaraná"), opt("lar", "Laranja")]);

// Hamburgueria
const ponto = group("ponto", "Ponto da carne", true, 1, [opt("ao", "Ao ponto"), opt("bem", "Bem passado")]);
const adic = group("adic", "Adicionais", false, 3, [opt("bacon", "Bacon", 5), opt("queijo", "Queijo extra", 4), opt("ovo", "Ovo", 3), opt("cebola", "Cebola caramelizada", 3.5)]);
const molhoBatata = group("molho", "Molho", false, 2, [opt("chedd", "Cheddar", 4), opt("maion", "Maionese da casa", 0), opt("barb", "Barbecue", 2)]);

// Marmitaria
const mistura = group("mistura", "Mistura", true, 1, [opt("frango", "Frango grelhado"), opt("carne", "Carne de panela"), opt("ling", "Linguiça toscana"), opt("ovo", "Ovo frito")]);
const salada = group("salada", "Salada", false, 2, [opt("alface", "Alface e tomate"), opt("beter", "Beterraba"), opt("farofa", "Farofa", 0)]);
const sobremesa = group("sobre", "Sobremesa", false, 1, [opt("pudim", "Pudim", 4), opt("mouse", "Mousse de maracujá", 4)]);

// Açaí
const frutas = group("frutas", "Frutas", false, 2, [opt("ban", "Banana"), opt("mor", "Morango", 2), opt("man", "Manga")]);
const compl = group("compl", "Complementos", false, 4, [opt("gran", "Granola"), opt("leite", "Leite em pó"), opt("pacoca", "Paçoca"), opt("cond", "Leite condensado")]);
const cobert = group("cobert", "Cobertura", true, 1, [opt("choc", "Chocolate"), opt("mor", "Morango"), opt("cara", "Caramelo")]);
const turbine = group("turbine", "Turbine", false, 2, [opt("nutella", "Creme de avelã", 6), opt("ovo", "Ovomaltine", 5)]);

// Japonês
const molhos = group("molhos", "Molhos e acompanhamentos", false, 3, [opt("shoyu", "Shoyu"), opt("tare", "Molho tarê"), opt("gengibre", "Gengibre e wasabi")]);
const cream = group("cream", "Cream cheese", false, 1, [opt("cc", "Com cream cheese", 4)]);

// Padaria
const bebidaCafe = group("bebida", "Bebida", true, 1, [opt("cafe", "Café com leite"), opt("suco", "Suco de laranja"), opt("choc", "Chocolate quente")]);

// Espetinho
const pontoEsp = group("ponto", "Ponto", true, 1, [opt("mal", "Mal passado"), opt("ao", "Ao ponto"), opt("bem", "Bem passado")]);
const acomp = group("acomp", "Acompanhamentos", false, 3, [opt("farofa", "Farofa"), opt("vinag", "Vinagrete"), opt("mand", "Mandioca frita", 4)]);

export const FOOD_STORES: FoodStore[] = [
  {
    id: "forno-da-serra", name: "Forno da Serra Pizzaria", city: "ipatinga", category: "pizza", blurb: "Pizzas de forno a lenha, massa de fermentação lenta.",
    etaMin: 35, etaMax: 50, deliveryFeeCents: c(6), minOrderCents: c(30), turns: [{ open: "10:00", close: "23:59" }], tone: 0, today: { orders: 46, ticketCents: c(68) },
    menu: [
      item("marg", "Pizzas grandes", "Margherita", 56, "Molho de tomate, mussarela, tomate fresco e manjericão. 8 fatias.", [massa, borda, extrasPizza]),
      item("calab", "Pizzas grandes", "Calabresa", 58, "Calabresa fatiada, cebola e mussarela. 8 fatias.", [massa, borda, extrasPizza]),
      item("port", "Pizzas grandes", "Portuguesa", 64, "Presunto, ovo, cebola, ervilha e mussarela. 8 fatias.", [massa, borda, extrasPizza]),
      item("frango", "Pizzas grandes", "Frango com catupiry", 66, "Frango desfiado e catupiry original. 8 fatias.", [massa, borda, extrasPizza]),
      item("queijos", "Pizzas grandes", "Quatro queijos", 68, "Mussarela, provolone, parmesão e catupiry. 8 fatias.", [massa, borda, extrasPizza]),
      item("lombo", "Pizzas grandes", "Lombo canadense", 72, "Lombo defumado, cebola roxa e mussarela. 8 fatias.", [massa, borda, extrasPizza]),
      item("brig", "Doces", "Chocolate com morango", 62, "Chocolate ao leite e morangos frescos. 8 fatias.", [massa, borda]),
      item("refri", "Bebidas", "Refrigerante 2 L", 14, "Gelado, para a mesa toda.", [refri2l]),
      item("suco", "Bebidas", "Suco de laranja 500 ml", 9, "Espremido na hora."),
    ],
  },
  {
    id: "brasa-e-pao", name: "Brasa & Pão Hamburgueria", city: "ipatinga", category: "lanches", blurb: "Hambúrguer artesanal na brasa, pão de batata.",
    etaMin: 25, etaMax: 40, deliveryFeeCents: c(5), minOrderCents: c(25), turns: [{ open: "10:00", close: "23:59" }], tone: 1, today: { orders: 38, ticketCents: c(41) },
    menu: [
      item("classico", "Hambúrgueres", "Clássico", 26, "Blend 160 g, queijo prato, alface e tomate.", [ponto, adic]),
      item("cheddar", "Hambúrgueres", "Cheddar bacon", 32, "Blend 160 g, cheddar cremoso e bacon crocante.", [ponto, adic]),
      item("duplo", "Hambúrgueres", "Duplo da casa", 38, "Dois blends 120 g, queijo prato e molho especial.", [ponto, adic]),
      item("crocante", "Hambúrgueres", "Frango crocante", 28, "Filé empanado, maionese de ervas e alface.", [adic]),
      item("veggie", "Hambúrgueres", "Veggie", 29, "Burger de grão-de-bico, rúcula e tomate seco.", [adic]),
      item("batata", "Acompanhamentos", "Batata frita média", 16, "Porção crocante, sal na medida.", [molhoBatata]),
      item("batata-ched", "Acompanhamentos", "Batata com cheddar e bacon", 22, "A média, coberta de cheddar e bacon."),
      item("shake", "Bebidas", "Milk-shake 400 ml", 18, "Chocolate, morango ou doce de leite."),
      item("lata", "Bebidas", "Refrigerante lata", 7, "350 ml, gelado."),
    ],
  },
  {
    id: "sabor-de-casa", name: "Marmitaria Sabor de Casa", city: "fabriciano", category: "marmita", blurb: "Comida caseira de verdade, feita todo dia.",
    etaMin: 30, etaMax: 45, deliveryFeeCents: c(4), minOrderCents: c(18), turns: [{ open: "10:30", close: "15:00" }, { open: "17:30", close: "21:00" }], tone: 2, today: { orders: 31, ticketCents: c(27) },
    menu: [
      item("p", "Marmitex", "Marmitex pequena", 18, "Arroz, feijão, uma mistura e guarnição.", [mistura, salada, sobremesa]),
      item("m", "Marmitex", "Marmitex média", 22, "Arroz, feijão, uma mistura e duas guarnições.", [mistura, salada, sobremesa]),
      item("g", "Marmitex", "Marmitex grande", 25, "Arroz, feijão, uma mistura e três guarnições.", [mistura, salada, sobremesa]),
      item("exec", "Pratos", "Executivo de frango", 24, "Filé de frango grelhado, arroz, feijão e legumes."),
      item("feij", "Pratos", "Feijoada completa", 25, "Feijão preto com carnes, couve, laranja e farofa."),
      item("estrog", "Pratos", "Strogonoff de frango", 23, "Com arroz branco e batata palha."),
      item("parm", "Pratos", "Frango à parmegiana", 25, "Filé empanado com molho e queijo, arroz e fritas."),
      item("suco", "Bebidas", "Suco natural 400 ml", 7, "Laranja, maracujá ou abacaxi com hortelã."),
      item("lata", "Bebidas", "Refrigerante lata", 6.5, "350 ml, gelado."),
      item("pudim", "Sobremesas", "Pudim de leite", 6, "Fatia individual com calda de caramelo."),
    ],
  },
  {
    id: "acai-pe-vermelho", name: "Açaí Pé Vermelho", city: "timoteo", category: "acai", blurb: "Açaí grosso, direto do Pará, só para retirada.",
    etaMin: 15, etaMax: 25, deliveryFeeCents: null, minOrderCents: c(14), turns: [{ open: "10:00", close: "22:00" }], tone: 3, today: { orders: 24, ticketCents: c(23) },
    menu: [
      item("a300", "Açaí no copo", "Açaí 300 ml", 14, "Monte do seu jeito.", [frutas, compl, cobert, turbine]),
      item("a500", "Açaí no copo", "Açaí 500 ml", 20, "O queridinho. Monte do seu jeito.", [frutas, compl, cobert, turbine]),
      item("a500n", "Açaí no copo", "Açaí 500 ml com leite ninho", 23, "Já vem com leite ninho e leite condensado.", [frutas, cobert, turbine]),
      item("a500f", "Açaí no copo", "Açaí fit 500 ml", 22, "Sem açúcar, com banana e granola sem glúten.", [frutas, turbine]),
      item("a700", "Açaí no copo", "Açaí 700 ml", 28, "Para dividir (ou não).", [frutas, compl, cobert, turbine]),
      item("cupu", "Outros sabores", "Creme de cupuaçu 500 ml", 18, "Cremoso, com leite condensado.", [frutas, cobert]),
      item("barca", "Para dividir", "Barca de açaí 1 L", 38, "Com quatro complementos à escolha.", [frutas, compl, turbine]),
      item("shake", "Bebidas", "Milk-shake de açaí 400 ml", 16, "Açaí batido com leite e banana."),
      item("coco", "Bebidas", "Água de coco 300 ml", 8, "Gelada."),
    ],
  },
  {
    id: "sushi-vale-sakura", name: "Sushi Vale Sakura", city: "ipatinga", category: "japones", blurb: "Culinária japonesa feita na hora, peixe sempre fresco.",
    etaMin: 40, etaMax: 60, deliveryFeeCents: c(8), minOrderCents: c(35), turns: [{ open: "11:30", close: "14:30" }, { open: "18:00", close: "23:30" }], tone: 0, today: { orders: 29, ticketCents: c(74) },
    menu: [
      item("c20", "Combinados", "Combo 20 peças", 59, "Sashimi, uramaki e hot roll variados.", [molhos]),
      item("c30", "Combinados", "Combo 30 peças", 82, "Mais peças do mesmo combinado, para dois.", [molhos]),
      item("hot", "Rolls", "Hot roll 8 unidades", 28, "Salmão empanado e crocante, com cream cheese.", [molhos]),
      item("ura", "Rolls", "Uramaki de salmão 8 unidades", 32, "Salmão fresco, pepino e gergelim.", [molhos]),
      item("tem", "Temakis", "Temaki de salmão", 29, "Cone de alga com arroz, salmão e cebolinha.", [cream]),
      item("skin", "Temakis", "Temaki skin", 24, "Pele de salmão crocante e cebolinha.", [cream]),
      item("sash", "Sashimi", "Sashimi de salmão 10 fatias", 38, "Fatias frescas, com gengibre.", [molhos]),
      item("yaki", "Quentes", "Yakisoba médio", 38, "Macarrão, legumes e frango, na chapa.", ),
      item("gyoza", "Quentes", "Gyoza 6 unidades", 24, "Pastelzinho japonês grelhado, com molho."),
    ],
  },
  {
    id: "trigo-dourado", name: "Padaria Trigo Dourado", city: "timoteo", category: "padaria", blurb: "Pão quentinho o dia todo, café da manhã e lanches.",
    etaMin: 20, etaMax: 35, deliveryFeeCents: c(3.5), minOrderCents: c(15), turns: [{ open: "05:30", close: "12:00" }, { open: "14:00", close: "19:30" }], tone: 1, today: { orders: 42, ticketCents: c(21) },
    menu: [
      item("pao", "Pães", "Pão francês 10 unidades", 7, "Saindo do forno."),
      item("pqueijo", "Pães", "Pão de queijo 12 unidades", 15, "Mineiro, assado na hora."),
      item("sonho", "Doces", "Sonho de creme", 7, "Recheio cremoso de baunilha."),
      item("fuba", "Doces", "Bolo de fubá (fatia)", 6, "Macio, com erva-doce."),
      item("cenoura", "Doces", "Bolo de cenoura inteiro", 38, "Com cobertura de chocolate."),
      item("misto", "Lanches", "Misto quente", 12, "Presunto e queijo na chapa."),
      item("chapa", "Lanches", "Pão na chapa", 6, "Com manteiga."),
      item("combo", "Combos", "Combo café da manhã", 24, "Pão na chapa, pão de queijo, fruta e uma bebida.", [bebidaCafe]),
      item("cafe", "Bebidas", "Café com leite 300 ml", 7, "Passado na hora."),
    ],
  },
  {
    id: "espetinho-do-ze", name: "Espetinho do Zé", city: "fabriciano", category: "espetinho", blurb: "Espetinho na brasa, tempero do Zé desde 2009.",
    etaMin: 25, etaMax: 40, deliveryFeeCents: c(5), minOrderCents: c(20), turns: [{ open: "17:00", close: "23:59" }], tone: 2, today: { orders: 27, ticketCents: c(39) },
    menu: [
      item("carne", "Espetinhos", "Espetinho de carne", 9, "Alcatra macia, na brasa.", [pontoEsp, acomp]),
      item("frango", "Espetinhos", "Espetinho de frango", 8, "Cubos de peito temperado.", [acomp]),
      item("ling", "Espetinhos", "Espetinho de linguiça", 8, "Linguiça toscana.", [acomp]),
      item("med", "Espetinhos", "Medalhão de frango com bacon", 11, "Enrolado no bacon.", [acomp]),
      item("coalho", "Espetinhos", "Queijo coalho", 9, "Dourado na brasa."),
      item("cora", "Espetinhos", "Coração de frango", 9, "Temperado com alho.", [acomp]),
      item("kit", "Kits", "Kit 5 espetinhos", 42, "Carne, frango, linguiça, medalhão e coalho, com farofa e vinagrete."),
      item("mand", "Porções", "Mandioca frita", 18, "Porção para dividir."),
      item("lata", "Bebidas", "Refrigerante lata", 6, "350 ml, gelado."),
    ],
  },
  // ---- Lojas fictícias extras: cada cidade fica com pelo menos cinco, para a aba nunca ficar vazia.
  {
    id: "tropical-acai", name: "Tropical Açaí & Cia", city: "ipatinga", category: "acai", blurb: "Açaí cremoso, copos grandes e muita fruta.",
    etaMin: 20, etaMax: 35, deliveryFeeCents: c(4.5), minOrderCents: c(15), turns: [{ open: "11:00", close: "23:00" }], tone: 3, today: { orders: 33, ticketCents: c(25) },
    menu: [
      item("a300", "Açaí no copo", "Açaí 300 ml", 15, "Monte do seu jeito.", [frutas, compl, cobert, turbine]),
      item("a500", "Açaí no copo", "Açaí 500 ml", 21, "O mais pedido da casa.", [frutas, compl, cobert, turbine]),
      item("a700", "Açaí no copo", "Açaí 700 ml", 29, "Para matar a vontade.", [frutas, compl, cobert, turbine]),
      item("barca", "Para dividir", "Barca de açaí 1 L", 39, "Com quatro complementos à escolha.", [frutas, compl, turbine]),
      item("shake", "Bebidas", "Milk-shake de açaí 400 ml", 17, "Açaí batido com leite e banana."),
      item("coco", "Bebidas", "Água de coco 300 ml", 8, "Gelada."),
    ],
  },
  {
    id: "cantinho-mineiro", name: "Cantinho Mineiro", city: "ipatinga", category: "marmita", blurb: "Comida mineira no capricho: feijão tropeiro, couve e torresmo.",
    etaMin: 30, etaMax: 45, deliveryFeeCents: c(5), minOrderCents: c(20), turns: [{ open: "10:30", close: "15:00" }, { open: "18:00", close: "21:30" }], tone: 0, today: { orders: 35, ticketCents: c(29) },
    menu: [
      item("m", "Marmitex", "Marmitex média", 23, "Arroz, feijão, uma mistura e duas guarnições.", [mistura, salada, sobremesa]),
      item("g", "Marmitex", "Marmitex grande", 27, "Arroz, feijão, uma mistura e três guarnições.", [mistura, salada, sobremesa]),
      item("tropeiro", "Pratos", "Feijão tropeiro completo", 28, "Com couve, torresmo, linguiça e ovo."),
      item("frango-q", "Pratos", "Frango com quiabo", 26, "Domingo todo dia, com angu."),
      item("suco", "Bebidas", "Suco natural 400 ml", 7, "Laranja, maracujá ou abacaxi."),
      item("doce", "Sobremesas", "Doce de leite caseiro", 6, "Porção individual."),
    ],
  },
  {
    id: "pizza-do-vale", name: "Pizza do Vale", city: "fabriciano", category: "pizza", blurb: "Pizza grande, borda recheada e entrega rápida.",
    etaMin: 35, etaMax: 50, deliveryFeeCents: c(5.5), minOrderCents: c(30), turns: [{ open: "17:00", close: "23:59" }], tone: 1, today: { orders: 28, ticketCents: c(64) },
    menu: [
      item("marg", "Pizzas grandes", "Margherita", 54, "Molho, mussarela, tomate e manjericão. 8 fatias.", [massa, borda, extrasPizza]),
      item("calab", "Pizzas grandes", "Calabresa", 56, "Calabresa, cebola e mussarela. 8 fatias.", [massa, borda, extrasPizza]),
      item("frango", "Pizzas grandes", "Frango com catupiry", 64, "Frango desfiado e catupiry. 8 fatias.", [massa, borda, extrasPizza]),
      item("bacon", "Pizzas grandes", "Bacon crocante", 66, "Bacon, milho e mussarela. 8 fatias.", [massa, borda, extrasPizza]),
      item("refri", "Bebidas", "Refrigerante 2 L", 13, "Gelado.", [refri2l]),
      item("suco", "Bebidas", "Suco de laranja 500 ml", 9, "Espremido na hora."),
    ],
  },
  {
    id: "burger-estacao", name: "Burger Estação", city: "fabriciano", category: "lanches", blurb: "Lanches artesanais e batata em dobro.",
    etaMin: 25, etaMax: 40, deliveryFeeCents: c(4), minOrderCents: c(22), turns: [{ open: "17:30", close: "23:30" }], tone: 2, today: { orders: 30, ticketCents: c(39) },
    menu: [
      item("classico", "Hambúrgueres", "Clássico", 25, "Blend 150 g, queijo, alface e tomate.", [ponto, adic]),
      item("bacon", "Hambúrgueres", "Bacon burger", 31, "Blend 150 g, bacon e cheddar.", [ponto, adic]),
      item("frango", "Hambúrgueres", "Frango crocante", 27, "Filé empanado e maionese de ervas.", [adic]),
      item("batata", "Acompanhamentos", "Batata frita média", 15, "Porção crocante.", [molhoBatata]),
      item("shake", "Bebidas", "Milk-shake 400 ml", 17, "Chocolate, morango ou doce de leite."),
      item("lata", "Bebidas", "Refrigerante lata", 6.5, "350 ml, gelado."),
    ],
  },
  {
    id: "pao-de-ouro", name: "Padaria Pão de Ouro", city: "fabriciano", category: "padaria", blurb: "Fornadas o dia inteiro e café coado na hora.",
    etaMin: 20, etaMax: 35, deliveryFeeCents: c(3), minOrderCents: c(12), turns: [{ open: "06:00", close: "12:00" }, { open: "14:00", close: "20:00" }], tone: 0, today: { orders: 37, ticketCents: c(22) },
    menu: [
      item("pao", "Pães", "Pão francês 10 unidades", 7.5, "Saindo do forno."),
      item("pqueijo", "Pães", "Pão de queijo 12 unidades", 14, "Mineiro, assado na hora."),
      item("sonho", "Doces", "Sonho de creme", 6.5, "Recheio cremoso."),
      item("bolo", "Doces", "Bolo de fubá (fatia)", 5.5, "Macio, com erva-doce."),
      item("misto", "Lanches", "Misto quente", 11, "Presunto e queijo na chapa."),
      item("combo", "Combos", "Combo café da manhã", 23, "Pão na chapa, pão de queijo e uma bebida.", [bebidaCafe]),
    ],
  },
  {
    id: "pizzaria-aco-quente", name: "Pizzaria Aço Quente", city: "timoteo", category: "pizza", blurb: "Pizza assada na pedra, massa fina e crocante.",
    etaMin: 35, etaMax: 55, deliveryFeeCents: c(6), minOrderCents: c(30), turns: [{ open: "17:30", close: "23:59" }], tone: 3, today: { orders: 26, ticketCents: c(66) },
    menu: [
      item("marg", "Pizzas grandes", "Margherita", 55, "Molho, mussarela, tomate e manjericão. 8 fatias.", [massa, borda, extrasPizza]),
      item("calab", "Pizzas grandes", "Calabresa", 57, "Calabresa, cebola e mussarela. 8 fatias.", [massa, borda, extrasPizza]),
      item("port", "Pizzas grandes", "Portuguesa", 63, "Presunto, ovo, cebola e ervilha. 8 fatias.", [massa, borda, extrasPizza]),
      item("queijos", "Pizzas grandes", "Quatro queijos", 67, "Mussarela, provolone, parmesão e catupiry. 8 fatias.", [massa, borda, extrasPizza]),
      item("refri", "Bebidas", "Refrigerante 2 L", 14, "Gelado.", [refri2l]),
      item("suco", "Bebidas", "Suco de laranja 500 ml", 9, "Espremido na hora."),
    ],
  },
  {
    id: "lanchonete-da-praca", name: "Lanchonete da Praça", city: "timoteo", category: "lanches", blurb: "O x-tudo da praça, do jeito que você gosta.",
    etaMin: 20, etaMax: 35, deliveryFeeCents: c(4), minOrderCents: c(18), turns: [{ open: "16:00", close: "23:30" }], tone: 1, today: { orders: 32, ticketCents: c(34) },
    menu: [
      item("xburger", "Lanches", "X-burger", 18, "Hambúrguer, queijo, alface e tomate.", [adic]),
      item("xbacon", "Lanches", "X-bacon", 22, "Hambúrguer, queijo e bacon.", [adic]),
      item("xtudo", "Lanches", "X-tudo", 28, "Hambúrguer, ovo, bacon, presunto, queijo e salada.", [adic]),
      item("batata", "Acompanhamentos", "Batata frita média", 14, "Porção crocante.", [molhoBatata]),
      item("suco", "Bebidas", "Suco natural 400 ml", 7, "Laranja ou maracujá."),
      item("lata", "Bebidas", "Refrigerante lata", 6, "350 ml, gelado."),
    ],
  },
  {
    id: "aco-e-sabor", name: "Marmitaria Aço & Sabor", city: "timoteo", category: "marmita", blurb: "Marmita reforçada para a hora do almoço.",
    etaMin: 25, etaMax: 40, deliveryFeeCents: c(4), minOrderCents: c(18), turns: [{ open: "10:30", close: "14:30" }], tone: 2, today: { orders: 34, ticketCents: c(26) },
    menu: [
      item("p", "Marmitex", "Marmitex pequena", 17, "Arroz, feijão, uma mistura e guarnição.", [mistura, salada, sobremesa]),
      item("m", "Marmitex", "Marmitex média", 21, "Arroz, feijão, uma mistura e duas guarnições.", [mistura, salada, sobremesa]),
      item("g", "Marmitex", "Marmitex grande", 24, "Arroz, feijão, uma mistura e três guarnições.", [mistura, salada, sobremesa]),
      item("exec", "Pratos", "Executivo de frango", 23, "Filé de frango grelhado, arroz, feijão e legumes."),
      item("suco", "Bebidas", "Suco natural 400 ml", 7, "Laranja, maracujá ou abacaxi."),
      item("pudim", "Sobremesas", "Pudim de leite", 6, "Fatia individual."),
    ],
  },
];

/** Nota fictícia (0 a 5) de cada loja, só para ordenar e enfeitar os cartões da demo. */
const RATINGS: Record<string, number> = {
  "forno-da-serra": 4.8, "brasa-e-pao": 4.7, "sabor-de-casa": 4.6, "acai-pe-vermelho": 4.9, "sushi-vale-sakura": 4.8, "trigo-dourado": 4.5, "espetinho-do-ze": 4.7,
  "tropical-acai": 4.6, "cantinho-mineiro": 4.8, "pizza-do-vale": 4.4, "burger-estacao": 4.6, "pao-de-ouro": 4.7, "pizzaria-aco-quente": 4.5, "lanchonete-da-praca": 4.3, "aco-e-sabor": 4.6,
};
export const ratingOf = (s: Pick<FoodStore, "id">) => RATINGS[s.id] ?? 4.5;

/** Selo de desconto fictício de algumas lojas (destaques). */
const PROMOS: Record<string, string> = {
  "forno-da-serra": "20% OFF", "brasa-e-pao": "Frete grátis", "acai-pe-vermelho": "15% OFF", "sushi-vale-sakura": "10% OFF", "cantinho-mineiro": "Sobremesa grátis",
  "tropical-acai": "Frete grátis", "pizza-do-vale": "25% OFF", "pao-de-ouro": "10% OFF", "lanchonete-da-praca": "Frete grátis", "pizzaria-aco-quente": "20% OFF",
};
export const promoOf = (s: Pick<FoodStore, "id">): string | null => PROMOS[s.id] ?? null;

/** Preço médio dos itens do cardápio (centavos), usado só para ordenar "menor preço". */
export const avgPriceCents = (s: Pick<FoodStore, "menu">) => (s.menu.length ? Math.round(s.menu.reduce((t, i) => t + i.priceCents, 0) / s.menu.length) : 0);

/** Cupons FICTÍCIOS da demonstração: nada disso é abatido de verdade no checkout. */
export type FoodCoupon = { id: string; title: string; rule: string; code: string; validUntil: string; tone: CoverTone };
export const FOOD_COUPONS: FoodCoupon[] = [
  { id: "frete-1a", title: "Frete grátis na 1ª compra", rule: "Em pedidos acima de R$ 25,00 com entrega. Uma vez por conta.", code: "PRIMEIRA", validUntil: "31/12/2026", tone: 3 },
  { id: "pizza20", title: "20% OFF em pizzas", rule: "Em pizzarias participantes, até R$ 15,00 de desconto. Não acumula com outros cupons.", code: "PIZZA20", validUntil: "15/12/2026", tone: 2 },
  { id: "acai10", title: "R$ 10 OFF no açaí", rule: "Em pedidos acima de R$ 40,00 em açaiterias participantes.", code: "ACAI10", validUntil: "20/12/2026", tone: 0 },
  { id: "noite", title: "Frete grátis à noite", rule: "Pedidos feitos entre 19h e 22h, nas lojas com entrega própria.", code: "NOITE", validUntil: "31/01/2027", tone: 1 },
];

/**
 * Banners promocionais do carrossel da home (fictícios). `to`: "cupons" abre a tela de cupons; "lojas" desce para a lista; senão é o id de uma loja.
 * `photo`: categoria cuja foto aparece no banner. `theme`: paleta (azul elétrico da Orbi com um acento por banner). `badge`: selo redondo (linha grande + linha pequena).
 */
export type FoodBannerTheme = "blue" | "coral" | "violet" | "night";
export type FoodBanner = { id: string; title: string; sub: string; cta: string; theme: FoodBannerTheme; photo: FoodCategoryId; photoVariant: 0 | 1; badge: [string, string]; to: string };
export const FOOD_BANNERS: FoodBanner[] = [
  { id: "b-frete", title: "Frete grátis na 1ª compra", sub: "Use o cupom PRIMEIRA", cta: "Pegar cupom", theme: "blue", photo: "lanches", photoVariant: 0, badge: ["R$ 0", "frete"], to: "cupons" },
  { id: "b-pizza", title: "Pizza com 20% off hoje", sub: "Nas pizzarias participantes", cta: "Ver lojas", theme: "coral", photo: "pizza", photoVariant: 1, badge: ["20%", "OFF"], to: "forno-da-serra" },
  { id: "b-acai", title: "Açaí em dobro às quartas", sub: "Lojas de açaí participantes", cta: "Ver lojas", theme: "violet", photo: "acai", photoVariant: 0, badge: ["2x", "quarta"], to: "acai-pe-vermelho" },
  { id: "b-noite", title: "Frete grátis à noite", sub: "Das 19h às 22h", cta: "Pegar cupom", theme: "night", photo: "espetinho", photoVariant: 0, badge: ["R$ 0", "frete"], to: "cupons" },
];

export const storeById = (id: string) => FOOD_STORES.find((s) => s.id === id);
export const categoryLabel = (id: FoodCategoryId) => FOOD_CATEGORIES.find((k) => k.id === id)!.label;
export const cityName = (id: FoodCityId) => FOOD_CITIES.find((k) => k.id === id)!.name;

/** Resumo fictício do dia para a equipe: pedidos, venda bruta, ticket médio e comissão estimada (sobre a venda, ao percentual de entrega própria). */
export function todaySummary() {
  const orders = FOOD_STORES.reduce((s, x) => s + x.today.orders, 0);
  const grossCents = FOOD_STORES.reduce((s, x) => s + x.today.orders * x.today.ticketCents, 0);
  return { stores: FOOD_STORES.length, orders, grossCents, ticketCents: orders ? Math.round(grossCents / orders) : 0, commissionCents: Math.round((grossCents * ORBI_FOOD_BPS) / 10000) };
}

/** Pedidos simulados recentes (fixos, determinísticos) para a lista da equipe. */
export function recentDemoOrders() {
  const steps = ["delivered", "preparing", "picked_up", "ready", "delivered", "pending", "cancelled", "delivered", "accepted", "picked_up"] as const;
  return steps.map((status, i) => {
    const store = FOOD_STORES[i % FOOD_STORES.length];
    const totalCents = Math.round(store.today.ticketCents * (0.8 + ((i * 7) % 5) * 0.1));
    const fulfillment: Fulfillment = status === "picked_up" || store.deliveryFeeCents === null ? "pickup" : "delivery";
    const final = fulfillment === "pickup" && status === "delivered" ? "picked_up" : status;
    return { code: `F${(4100 + i * 13).toString()}`, storeName: store.name, status: final as FoodStatus, fulfillment, totalCents, minutesAgo: 4 + i * 9 };
  });
}
