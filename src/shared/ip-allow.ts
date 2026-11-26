/**
 * Lista de IPs permitidos para o painel (ADMIN_ALLOWED_IPS): IPv4, IPv6 e faixas CIDR, separados por vírgula.
 * Funções puras (sem I/O), testadas em tests/ip-allow.test.ts. Lista vazia: recurso desligado.
 */

type Parsed = { v: 4 | 6; n: bigint };
export type AllowRule = { v: 4 | 6; base: bigint; bits: number };
export type AllowList = {
  /** A lista foi pedida (há algo escrito). Pedida mas sem nenhuma regra válida: ninguém passa. */
  enabled: boolean;
  rules: AllowRule[];
  /** Entradas mal formadas (produção de verdade recusa subir com elas). */
  invalid: string[];
};

function parseV4(s: string): bigint | null {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(s);
  if (!m) return null;
  let n = 0n;
  for (let i = 1; i <= 4; i++) {
    if (m[i].length > 1 && m[i].startsWith("0")) return null; // sem zeros à esquerda (ambíguo: octal)
    const o = Number(m[i]);
    if (o > 255) return null;
    n = (n << 8n) | BigInt(o);
  }
  return n;
}

function parseV6(s: string): bigint | null {
  if (!/^[0-9a-f:.]+$/i.test(s) || !s.includes(":")) return null;
  let text = s;
  // Final em IPv4 (::ffff:1.2.3.4): vira dois grupos.
  const tail4 = /(\d{1,3}(?:\.\d{1,3}){3})$/.exec(text);
  if (tail4) {
    const v4 = parseV4(tail4[1]);
    if (v4 === null) return null;
    text = `${text.slice(0, -tail4[1].length)}${((v4 >> 16n) & 0xffffn).toString(16)}:${(v4 & 0xffffn).toString(16)}`;
  }
  const halves = text.split("::");
  if (halves.length > 2) return null;
  const head = halves[0] ? halves[0].split(":") : [];
  const tail = halves.length === 2 && halves[1] ? halves[1].split(":") : [];
  const fill = halves.length === 2 ? 8 - head.length - tail.length : 0;
  if (fill < 0 || (halves.length === 2 && fill < 1) || (halves.length === 1 && head.length !== 8)) return null;
  const groups = [...head, ...Array<string>(fill).fill("0"), ...tail];
  if (groups.length !== 8 || groups.some((g) => !/^[0-9a-f]{1,4}$/i.test(g))) return null;
  return groups.reduce((acc, g) => (acc << 16n) | BigInt(parseInt(g, 16)), 0n);
}

/** Endereço em número; IPv4 dentro de IPv6 (::ffff:a.b.c.d) vale como IPv4. null: não é um IP. */
export function parseIp(raw: string): Parsed | null {
  const s = raw.trim().replace(/^\[|\]$/g, "").split("%")[0];
  const v4 = parseV4(s);
  if (v4 !== null) return { v: 4, n: v4 };
  const v6 = parseV6(s);
  if (v6 === null) return null;
  if (v6 >> 32n === 0xffffn) return { v: 4, n: v6 & 0xffffffffn };
  return { v: 6, n: v6 };
}

const mask = (v: 4 | 6, bits: number) => {
  const size = v === 4 ? 32 : 128;
  return ((1n << BigInt(size)) - 1n) ^ ((1n << BigInt(size - bits)) - 1n);
};

/** Uma regra: "1.2.3.4", "10.0.0.0/8", "2001:db8::/32" ou "::1". */
export function parseRule(entry: string): AllowRule | null {
  const [addr, len, ...extra] = entry.trim().split("/");
  if (extra.length) return null;
  const ip = parseIp(addr);
  if (!ip) return null;
  const max = ip.v === 4 ? 32 : 128;
  // IPv4 escrito como ::ffff:a.b.c.d com prefixo seria ambíguo: só aceita sem prefixo.
  if (len !== undefined && addr.includes(":") && ip.v === 4) return null;
  let bits = max;
  if (len !== undefined) {
    if (!/^\d{1,3}$/.test(len)) return null;
    bits = Number(len);
    if (bits > max) return null;
  }
  return { v: ip.v, base: ip.n & mask(ip.v, bits), bits };
}

/** Lê o valor da variável. Vazio ou só espaços: desligado. */
export function parseAllowList(raw: string | undefined | null): AllowList {
  const entries = (raw ?? "").split(",").map((x) => x.trim()).filter(Boolean);
  const rules: AllowRule[] = [];
  const invalid: string[] = [];
  for (const e of entries) {
    const r = parseRule(e);
    if (r) rules.push(r); else invalid.push(e);
  }
  return { enabled: entries.length > 0, rules, invalid };
}

/** O IP pode entrar? Lista desligada: sim. Ligada: só se o IP for válido e cair em alguma regra (lista mal formada nunca libera). */
export function ipAllowed(list: AllowList, ip: string | null | undefined): boolean {
  if (!list.enabled) return true;
  const p = ip ? parseIp(ip) : null;
  if (!p) return false;
  return list.rules.some((r) => r.v === p.v && (p.n & mask(r.v, r.bits)) === r.base);
}

/** Problemas da lista para a checagem de subida em produção. */
export const allowListProblems = (raw: string | undefined | null): string[] => {
  const l = parseAllowList(raw);
  return l.invalid.length ? [`ADMIN_ALLOWED_IPS tem entradas inválidas (${l.invalid.slice(0, 3).join(", ")}): use IPv4, IPv6 ou CIDR separados por vírgula.`] : [];
};

// Cache da última lista lida: o ambiente quase nunca muda e o proxy roda a cada pedido.
let cached: { raw: string; list: AllowList } | null = null;
/** Lista do ambiente (ADMIN_ALLOWED_IPS), com cache. */
export function adminAllowList(env: Record<string, string | undefined> = process.env): AllowList {
  const raw = env.ADMIN_ALLOWED_IPS ?? "";
  if (!cached || cached.raw !== raw) cached = { raw, list: parseAllowList(raw) };
  return cached.list;
}
