/**
 * Documentos com cálculo correto, gerados só para o banco descartável dos testes.
 * Arquivo sem Playwright: o Vitest confere os geradores contra as regras de validação do app.
 */
const digits = (n: number) => Array.from({ length: n }, () => Math.floor(Math.random() * 10)).join("");

/** CPF aleatório com os dois dígitos verificadores certos e nunca com todos os números iguais. */
export function validCpf() {
  const dv = (s: string) => { let t = 0; for (let i = 0; i < s.length; i++) t += Number(s[i]) * (s.length + 1 - i); const r = (t * 10) % 11; return r === 10 ? 0 : r; };
  for (;;) {
    const base = digits(9);
    if (/^(\d)\1+$/.test(base)) continue;
    const a = base + dv(base);
    return a + dv(a);
  }
}

export function makeCnh() {
  for (;;) {
    const b = digits(9);
    if (/^(\d)\1+$/.test(b)) continue;
    let s1 = 0, s2 = 0;
    for (let i = 0; i < 9; i++) { s1 += Number(b[i]) * (9 - i); s2 += Number(b[i]) * (i + 1); }
    const d1 = s1 % 11, d2 = s2 % 11;
    if (d1 < 10 && d2 < 10) return `${b}${d1}${d2}`;
  }
}

export const randomDigits = digits;
