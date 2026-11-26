import { FOOD_STORES } from "./demo-data";
import type { FoodCategoryId, FoodStore } from "./types";

/**
 * Fotos genéricas de comida do Orbi Food (arquivos em public/food/, 800x600 WebP, miniaturas 160x160).
 * Todas vêm do Wikimedia Commons com licença livre (CC0 ou Creative Commons com atribuição); o crédito de cada uma
 * aparece em /creditos. Foram recortadas e comprimidas. Ao trocar ou incluir uma foto, atualize esta lista.
 * `asset()` (frontend/lib/site-mode) deve embrulhar o caminho quando ele vira URL crua.
 */
export type FoodPhotoCredit = { file: string; title: string; author: string; license: string; licenseUrl: string };

const cc = (v: string) => `https://creativecommons.org/licenses/${v}`;
const BY2 = { license: "CC BY 2.0", licenseUrl: cc("by/2.0/") };
const BYSA4 = { license: "CC BY-SA 4.0", licenseUrl: cc("by-sa/4.0/") };

export const FOOD_PHOTO_CREDITS: FoodPhotoCredit[] = [
  { file: "acai-1", title: "Berries Galore Acai Bowl (30276166867).jpg", author: "Ella Olsson", ...BY2 },
  { file: "acai-2", title: "Acai bowl (43779425762).jpg", author: "Ella Olsson", ...BY2 },
  { file: "pizza-1", title: "Pizza Margherita in Naples 2015.JPG", author: "Kos88", ...BYSA4 },
  { file: "pizza-2", title: "Pizza Margherita (14565452088).jpg", author: "jeffreyw", ...BY2 },
  { file: "lanches-1", title: "Homemade cheeseburger.jpg", author: "Thogru", license: "CC BY 3.0", licenseUrl: cc("by/3.0/") },
  { file: "lanches-2", title: "Onion jam stuffed bacon cheeseburger.jpg", author: "jeffreyw", ...BY2 },
  { file: "marmita-1", title: "Feijoada completa.jpg", author: "Andre Rebeiro", ...BY2 },
  { file: "marmita-2", title: "Feijoada à brasileira -.jpg", author: "Bradleyzm", ...BYSA4 },
  { file: "japones-1", title: "Cuisine japonaise à Saint-Maurice-de-Beynost (restaurant à emporter La Perle Sushi) - 3.jpg", author: "Benoît Prieur", license: "CC0 1.0", licenseUrl: "https://creativecommons.org/publicdomain/zero/1.0/" },
  { file: "japones-2", title: "202407171813 IMG 7121.jpg", author: "ウィ貴公子", ...BYSA4 },
  { file: "padaria-1", title: "Pao frances.jpg", author: "Roosewelt Pinheiro/Agência Brasil", license: "CC BY 3.0 BR", licenseUrl: cc("by/3.0/br/") },
  { file: "padaria-2", title: "French bread (5821638701).jpg", author: "jeffreyw", ...BY2 },
  { file: "espetinho-1", title: "Espetos de carne e queijo.jpg", author: "Barão de Itararé", ...BYSA4 },
  { file: "espetinho-2", title: "Chenjeh.jpg", author: "مانفی", ...BYSA4 },
];

export const photoPageUrl = (c: Pick<FoodPhotoCredit, "title">) => `https://commons.wikimedia.org/wiki/File:${encodeURIComponent(c.title.replace(/ /g, "_"))}`;

/** Foto da categoria (variante 0 ou 1). */
export const categoryPhoto = (cat: FoodCategoryId, variant: 0 | 1 = 0) => `/food/${cat}-${variant + 1}.webp`;
/** Miniatura quadrada da categoria (bolinha do filtro). */
export const categoryThumb = (cat: FoodCategoryId) => `/food/${cat}-thumb.webp`;

/** Foto da loja: a da categoria, alternando entre as duas pela ordem da loja dentro da categoria (lojas da mesma categoria não repetem a foto). */
export function storePhoto(s: Pick<FoodStore, "id" | "category">): string {
  const idx = FOOD_STORES.filter((x) => x.category === s.category).findIndex((x) => x.id === s.id);
  return categoryPhoto(s.category, (Math.max(idx, 0) % 2) as 0 | 1);
}
