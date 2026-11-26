import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import type { NextRequest } from "next/server";
import { rawClientIp, UNKNOWN_IP } from "@/shared/client-ip";
import type { Env } from "@/shared/runtime-config";

/**
 * Peças de segurança usadas pela API: IP real de quem acessa, limite de tentativas, senha forte,
 * tipo real dos arquivos enviados, cifra de segredos e códigos do aplicativo autenticador (TOTP).
 */

// ------------------------------------------------------------------ IP de quem acessa

export { UNKNOWN_IP };

/**
 * Chave de limite para um IP: IPv4 fica como está; IPv6 vira o prefixo /64 (quem tem um bloco IPv6 recebe milhões de
 * endereços e trocaria de "IP" a cada pedido). Endereço IPv4 embutido em IPv6 (::ffff:1.2.3.4) volta a ser IPv4.
 */
export function ipLimitKey(raw: string): string {
  let ip = raw.trim().replace(/^\[|\]$/g, "").split("%")[0];
  if (!ip.includes(":")) return ip;
  const mapped = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i.exec(ip);
  if (mapped) return mapped[1];
  if (ip.includes(".")) return ip; // formato misto desconhecido: não arrisca agrupar errado
  const halves = ip.split("::");
  if (halves.length > 2) return ip;
  const head = halves[0] ? halves[0].split(":") : [];
  const tail = halves.length === 2 && halves[1] ? halves[1].split(":") : [];
  const fill = halves.length === 2 ? 8 - head.length - tail.length : 0;
  if (fill < 0 || (halves.length === 1 && head.length !== 8)) return ip;
  const groups = [...head, ...Array(fill).fill("0"), ...tail];
  if (groups.length !== 8 || groups.some((g) => !/^[0-9a-f]{1,4}$/i.test(g))) return ip;
  return `${groups.slice(0, 4).map((g) => g.toLowerCase().padStart(4, "0")).join(":")}::/64`;
}

/**
 * O IP vem do proxy da hospedagem. O primeiro valor de x-forwarded-for é escrito pelo próprio navegador e pode ser
 * falso; o confiável é o que o proxy acrescentou por último. TRUST_PROXY_HOPS diz quantos proxies há na frente.
 * Em produção os cabeçalhos só são aceitos com TRUST_PROXY_HOPS válido (TRUST_X_REAL_IP=true sozinho não basta):
 * sem ela qualquer um poderia trocar de "IP" a cada pedido e escapar dos limites de tentativa. Fora de produção,
 * o padrão é 1 proxy (desenvolvimento, túnel do celular e testes). O resultado já vem pronto para chave de limite
 * (IPv6 agrupado em /64, veja ipLimitKey).
 */
export function resolveClientIp(h: Headers, env: Env = process.env): string {
  return ipLimitKey(rawClientIp(h, env));
}

let warnedProxy = false;
export function clientIp(req: NextRequest | Request) {
  const ip = resolveClientIp(req.headers);
  if (ip === UNKNOWN_IP && !warnedProxy) {
    warnedProxy = true;
    console.error("[segurança] TRUST_PROXY_HOPS ausente ou inválido: o IP de quem acessa não é confiável e todos dividem o mesmo limite de tentativas. Em produção de verdade o servidor nem sobe assim (veja o README).");
  }
  return ip;
}

// ------------------------------------------------------------------ limite de tentativas

type Bucket = { n: number; until: number; blocked?: boolean };
const buckets = new Map<string, Bucket>();
let lastSweep = 0;
const MAX_BUCKETS = 50_000;

/**
 * Libera espaço quando há chaves demais: primeiro descarta só as janelas vencidas; se ainda estiver cheio, as mais
 * antigas (a ordem do Map é a de criação). Contadores ativos recentes nunca são zerados de uma vez.
 */
export function evictBuckets(map: Map<string, Bucket>, now: number, max = MAX_BUCKETS) {
  for (const [k, v] of map) if (v.until < now) map.delete(k);
  if (map.size <= max) return;
  // Bloqueios ativos (quem já estourou o limite) ficam por último na fila de descarte: encher o mapa com chaves
  // novas não pode "soltar" quem está bloqueado.
  let extra = map.size - Math.floor(max * 0.9);
  for (const [k, v] of map) { if (extra <= 0) break; if (!v.blocked) { map.delete(k); extra--; } }
  for (const k of map.keys()) { if (extra <= 0) break; map.delete(k); extra--; }
}

/**
 * Conta tentativas por chave dentro de uma janela. Devolve false quando passou do limite.
 * A memória é limpa de tempos em tempos, para um ataque com muitas chaves não esgotar o servidor.
 */
export function rateLimit(key: string, max = 10, windowMs = 15 * 60_000) {
  const now = Date.now();
  if (now - lastSweep > 60_000 || buckets.size > MAX_BUCKETS) {
    lastSweep = now;
    evictBuckets(buckets, now);
  }
  const b = buckets.get(key);
  if (!b || b.until < now) { buckets.delete(key); buckets.set(key, { n: 1, until: now + windowMs }); return true; }
  b.n += 1;
  if (b.n > max) b.blocked = true;
  return b.n <= max;
}

/** Só consulta (não conta): true se a chave já passou do limite na janela atual. */
export function isRateLimited(key: string, max = 10) {
  const b = buckets.get(key);
  return !!b && b.until >= Date.now() && b.n > max;
}

/** Zera a contagem (por exemplo, depois de um login certo). */
export const resetLimit = (key: string) => { buckets.delete(key); };

// ------------------------------------------------------------------ senha

// Senhas mais usadas no Brasil e no mundo (vazamentos públicos): recusadas mesmo com 8 caracteres ou mais.
const COMMON = new Set([
  "12345678", "123456789", "1234567890", "12345678910", "123123123", "87654321", "11111111", "00000000", "99999999", "12341234",
  "password", "password1", "senha123", "senha1234", "senhasenha", "qwertyui", "qwerty123", "asdfghjk", "iloveyou", "abcd1234",
  "abc12345", "mudar123", "admin123", "administrador", "brasil123", "flamengo", "corinthians", "palmeiras", "cruzeiro", "atletico",
  "prumo123", "prumoprumo", "ipatinga", "timoteo123", "minhasenha", "teste123", "teste1234", "11223344", "102030405060",
]);

/** Motivo para recusar a senha, ou null se ela serve. */
export function passwordProblem(password: string, personal: (string | null | undefined)[] = []) {
  if (password.length < 8) return "A senha precisa de pelo menos 8 caracteres.";
  if (password.length > 128) return "A senha pode ter até 128 caracteres.";
  const lower = password.toLowerCase();
  if (COMMON.has(lower) || /^(.)\1+$/.test(password) || /^(0123456789|1234567890|9876543210)/.test(password)) return "Essa senha é muito usada e fácil de adivinhar. Escolha outra.";
  for (const p of personal) {
    const v = (p ?? "").toLowerCase().replace(/\s+/g, "");
    if (v.length >= 4 && (lower.includes(v) || lower.includes(v.split("@")[0] ?? ""))) return "A senha não pode conter seu nome, e-mail ou telefone.";
  }
  return null;
}

// ------------------------------------------------------------------ arquivos enviados

/** Tipo real do arquivo pelos primeiros bytes (não pelo que o navegador declarou). */
export function sniffFile(buf: Buffer): "image/jpeg" | "image/png" | "image/webp" | "application/pdf" | null {
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "image/jpeg";
  if (buf.length >= 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png";
  if (buf.length >= 12 && buf.subarray(0, 4).toString("latin1") === "RIFF" && buf.subarray(8, 12).toString("latin1") === "WEBP") return "image/webp";
  if (buf.length >= 5 && buf.subarray(0, 5).toString("latin1") === "%PDF-") return "application/pdf";
  return null;
}

/** Cabeçalhos para entregar um arquivo enviado por usuário sem que ele rode nada no site. */
export const fileHeaders = (mime: string, extra: Record<string, string> = {}) => ({
  "Content-Type": mime, "X-Content-Type-Options": "nosniff", "Content-Security-Policy": "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox",
  "Cross-Origin-Resource-Policy": "same-origin", ...extra,
});

// ------------------------------------------------------------------ cifra de segredos (AES-256-GCM)

const keyFrom = (secret: Uint8Array) => createHash("sha256").update("prumo:cifra:v1").update(secret).digest();

export function encrypt(text: string, secret: Uint8Array) {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", keyFrom(secret), iv);
  const data = Buffer.concat([c.update(text, "utf8"), c.final()]);
  return `v1.${iv.toString("base64url")}.${c.getAuthTag().toString("base64url")}.${data.toString("base64url")}`;
}

export function decrypt(blob: string, secret: Uint8Array) {
  const [v, iv, tag, data] = blob.split(".");
  if (v !== "v1" || !iv || !tag || !data) throw new Error("Segredo em formato desconhecido.");
  const d = createDecipheriv("aes-256-gcm", keyFrom(secret), Buffer.from(iv, "base64url"));
  d.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([d.update(Buffer.from(data, "base64url")), d.final()]).toString("utf8");
}

// ------------------------------------------------------------------ aplicativo autenticador (TOTP, RFC 6238)

const B32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export function base32Encode(buf: Buffer) {
  let bits = 0, value = 0, out = "";
  for (const byte of buf) {
    value = (value << 8) | byte; bits += 8;
    while (bits >= 5) { out += B32[(value >>> (bits - 5)) & 31]; bits -= 5; }
  }
  if (bits > 0) out += B32[(value << (5 - bits)) & 31];
  return out;
}

export function base32Decode(text: string) {
  const clean = text.toUpperCase().replace(/[^A-Z2-7]/g, "");
  let bits = 0, value = 0;
  const out: number[] = [];
  for (const ch of clean) {
    value = (value << 5) | B32.indexOf(ch); bits += 5;
    if (bits >= 8) { out.push((value >>> (bits - 8)) & 255); bits -= 8; }
  }
  return Buffer.from(out);
}

export const newTotpSecret = () => base32Encode(randomBytes(20));

/** Código de 6 dígitos para um passo de 30 s. */
export function totpAt(secretB32: string, step: number) {
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(BigInt(step));
  const h = createHmac("sha1", base32Decode(secretB32)).update(msg).digest();
  const off = h[h.length - 1] & 15;
  const bin = ((h[off] & 0x7f) << 24) | (h[off + 1] << 16) | (h[off + 2] << 8) | h[off + 3];
  return String(bin % 1_000_000).padStart(6, "0");
}

export const totpStep = (now = Date.now()) => Math.floor(now / 30_000);

/**
 * Confere o código aceitando o passo anterior e o seguinte (relógio do celular adiantado ou atrasado).
 * Devolve o passo usado, para impedir que o mesmo código seja reaproveitado.
 */
export function verifyTotp(secretB32: string, code: string, lastStep: number | null, now = Date.now()) {
  if (!/^\d{6}$/.test(code)) return null;
  const cur = totpStep(now);
  for (const s of [cur - 1, cur, cur + 1]) {
    if (lastStep !== null && s <= lastStep) continue;
    if (timingSafeEqual(Buffer.from(totpAt(secretB32, s)), Buffer.from(code))) return s;
  }
  return null;
}

export const otpauthUrl = (secretB32: string, account: string) =>
  `otpauth://totp/${encodeURIComponent(`Orbi:${account}`)}?secret=${secretB32}&issuer=Orbi&algorithm=SHA1&digits=6&period=30`;

/**
 * Códigos de recuperação: 10 códigos de uso único, mostrados uma vez; só o resumo fica guardado.
 * Cada código tem 64 bits (16 hex) e o resumo é um HMAC-SHA-256 com a chave do servidor (AUTH_SECRET), prefixo "v2:":
 * um vazamento só do banco não permite testar códigos offline. Os resumos antigos (SHA-256 puro, 40 bits, sem prefixo)
 * ainda são aceitos na conferência e saem da lista quando usados; gerar códigos novos troca todos pelo formato novo.
 */
const normRecovery = (code: string) => code.toUpperCase().replace(/[^A-Z0-9]/g, "");
export function newRecoveryCodes(secret: Uint8Array) {
  const codes = Array.from({ length: 10 }, () => randomBytes(8).toString("hex").toUpperCase().replace(/(.{4})(?=.)/g, "$1-"));
  return { codes, hashes: codes.map((c) => hashRecovery(c, secret)) };
}
export const hashRecovery = (code: string, secret: Uint8Array) => `v2:${createHmac("sha256", secret).update(`prumo:rec:${normRecovery(code)}`).digest("hex")}`;
/** Resumo no formato antigo, só para reconhecer códigos já gravados. */
export const legacyHashRecovery = (code: string) => createHash("sha256").update(`prumo:rec:${normRecovery(code)}`).digest("hex");
/** Devolve o resumo guardado que corresponde ao código digitado (novo ou antigo), ou null. */
export function findRecovery(code: string, stored: string[], secret: Uint8Array): string | null {
  const candidates = [hashRecovery(code, secret), legacyHashRecovery(code)];
  for (const c of candidates) {
    for (const h of stored) if (h.length === c.length && timingSafeEqual(Buffer.from(h), Buffer.from(c))) return h;
  }
  return null;
}
