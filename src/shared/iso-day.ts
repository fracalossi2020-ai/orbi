/** Dia no formato AAAA-MM-DD, existente no calendário (rejeita 2026-02-31). Usado nos filtros de período dos relatórios. */
export function isIsoDay(v: string | null | undefined): v is string {
  if (!v || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const d = new Date(`${v}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
}
