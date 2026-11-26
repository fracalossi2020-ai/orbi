"use client";
import { useState } from "react";
import { Icon } from "@/frontend/components/Icon";
import { api, Badge, Empty, ErrorNote, Field, Spinner, useAction, useLive } from "@/frontend/components/ui";
import { brl } from "@/shared/pricing";

export type Col = {
  key: string; label: string;
  kind?: "text" | "number" | "money" | "percent" | "boolean" | "select" | "date" | "textarea";
  options?: { value: string; label: string }[]; required?: boolean;
  hint?: string; readOnly?: boolean; hideInTable?: boolean; hideInForm?: boolean;
  render?: (row: Row) => React.ReactNode;
};
export type Row = Record<string, any> & { id: string }; // eslint-disable-line

function toForm(col: Col, v: unknown): string | boolean {
  if (col.kind === "boolean") return !!v;
  if (v === null || v === undefined) return "";
  if (col.kind === "money") return (Number(v) / 100).toFixed(2).replace(".", ",");
  if (col.kind === "percent") return (Number(v) / 100).toString().replace(".", ",");
  if (col.kind === "date") return String(v).slice(0, 10);
  return String(v);
}
function fromForm(col: Col, v: string | boolean): unknown {
  if (col.kind === "boolean") return !!v;
  if (v === "") return col.required ? undefined : null;
  if (col.kind === "money") return Math.round(Number(String(v).replace(",", ".")) * 100);
  if (col.kind === "percent") return Math.round(Number(String(v).replace(",", ".")) * 100);
  if (col.kind === "number") return Number(String(v).replace(",", "."));
  return v;
}
function display(col: Col, row: Row) {
  if (col.render) return col.render(row);
  const v = row[col.key];
  if (v === null || v === undefined || v === "") return <span className="text-muted">—</span>;
  if (col.kind === "boolean") return v ? <Badge tone="ok">Sim</Badge> : <Badge>Não</Badge>;
  if (col.kind === "money") return <span className="num">{brl(Number(v))}</span>;
  if (col.kind === "percent") return <span className="num">{(Number(v) / 100).toLocaleString("pt-BR")}%</span>;
  if (col.kind === "date") return new Date(v).toLocaleDateString("pt-BR");
  if (col.kind === "select") return col.options?.find((o) => o.value === v)?.label ?? String(v);
  return String(v);
}

/** Tabela administrativa guiada por configuração: listar, criar, editar e excluir. */
export function Crud({ resource, columns, canWrite, canCreate = true, canDelete = false, emptyTitle, emptyText }: {
  resource: string; columns: Col[]; canWrite: boolean; canCreate?: boolean; canDelete?: boolean; emptyTitle: string; emptyText?: string;
}) {
  const { data, loading, reload } = useLive<{ rows: Row[] }>(`/api/admin/r/${resource}`, { live: false });
  const [editing, setEditing] = useState<Row | "new" | null>(null);
  const [form, setForm] = useState<Record<string, string | boolean>>({});
  const { busy, error, run, setError } = useAction();
  const formCols = columns.filter((c) => !c.hideInForm);
  const tableCols = columns.filter((c) => !c.hideInTable);

  const open = (row: Row | "new") => {
    setError(null);
    setEditing(row);
    setForm(Object.fromEntries(formCols.map((c) => [c.key, row === "new" ? (c.kind === "boolean" ? true : "") : toForm(c, row[c.key])])));
  };
  const save = () => run(async () => {
    const payload: Record<string, unknown> = {};
    for (const c of formCols) {
      if (c.readOnly) continue;
      const v = fromForm(c, form[c.key]);
      if (v !== undefined) payload[c.key] = v;
    }
    if (editing === "new") await api(`/api/admin/r/${resource}`, { body: payload });
    else await api(`/api/admin/r/${resource}/${(editing as Row).id}`, { method: "PATCH", body: payload });
    setEditing(null);
    reload();
  });

  return (
    <div>
      {canWrite && canCreate && !editing && <button type="button" className="btn btn-primary mb-4" onClick={() => open("new")}><Icon name="plus" size={18} /> Adicionar</button>}
      {editing && (
        <form className="card anim-rise mb-4 space-y-3 p-5" onSubmit={(e) => { e.preventDefault(); save(); }}>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {formCols.map((c) => {
              const set = (v: string | boolean) => setForm((p) => ({ ...p, [c.key]: v }));
              const v = form[c.key];
              if (c.kind === "boolean") return <label key={c.key} className="flex items-center gap-3 self-end py-3 font-semibold"><input type="checkbox" name={c.key} className="size-5 accent-[var(--primary)]" checked={!!v} onChange={(e) => set(e.target.checked)} />{c.label}</label>;
              return (
                <Field key={c.key} label={c.label} hint={c.hint}>
                  {c.kind === "select" ? (
                    <select className="input" name={c.key} disabled={c.readOnly} required={c.required} value={String(v)} onChange={(e) => set(e.target.value)}>
                      <option value="">Escolha</option>{c.options?.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                  ) : c.kind === "textarea" ? <textarea className="input" name={c.key} value={String(v)} onChange={(e) => set(e.target.value)} />
                    : <input className="input" name={c.key} disabled={c.readOnly} required={c.required} type={c.kind === "date" ? "date" : "text"} inputMode={c.kind === "money" || c.kind === "percent" || c.kind === "number" ? "decimal" : undefined} value={String(v)} onChange={(e) => set(e.target.value)} />}
                </Field>
              );
            })}
          </div>
          <ErrorNote>{error}</ErrorNote>
          <div className="flex gap-2"><button className="btn btn-primary" disabled={busy}>{busy ? "Salvando…" : "Salvar"}</button><button type="button" className="btn btn-ghost" onClick={() => setEditing(null)}>Cancelar</button></div>
        </form>
      )}
      {loading && !data ? <Spinner /> : !data?.rows.length ? <Empty icon="doc" title={emptyTitle}>{emptyText}</Empty> : <DataTable columns={tableCols} rows={data.rows} actions={canWrite ? (r) => (
        <div className="flex gap-1">
          <button type="button" className="btn btn-soft btn-sm" onClick={() => open(r)}>Editar</button>
          {canDelete && <button type="button" className="btn btn-ghost btn-sm" onClick={() => { if (confirm("Excluir este registro?")) run(async () => { await api(`/api/admin/r/${resource}/${r.id}`, { method: "DELETE" }); reload(); }); }}>Excluir</button>}
        </div>
      ) : undefined} />}
    </div>
  );
}

/**
 * No computador, tabela com rolagem lateral. No celular (abaixo de md), cada linha vira um cartão com "rótulo: valor",
 * sem rolagem lateral. Os papéis ARIA ficam explícitos porque display:block tira a semântica de tabela em alguns leitores de tela.
 */
export function DataTable({ columns, rows, actions }: { columns: Col[]; rows: Row[]; actions?: (r: Row) => React.ReactNode }) {
  return (
    <div className="card overflow-x-auto max-md:overflow-visible max-md:!bg-transparent max-md:!shadow-none">
      <table role="table" className="w-full text-left text-sm max-md:block md:min-w-max">
        <thead role="rowgroup" className="max-md:sr-only"><tr role="row" className="border-b border-line text-muted">{columns.map((c) => <th role="columnheader" key={c.key} scope="col" className="px-4 py-3 font-semibold">{c.label}</th>)}{actions && <th role="columnheader" scope="col" className="px-4 py-3"><span className="sr-only">Ações</span></th>}</tr></thead>
        <tbody role="rowgroup" className="divide-y divide-line max-md:block max-md:space-y-3 max-md:divide-y-0">
          {rows.map((r, i) => (
            <tr role="row" key={r.id ?? i} className="max-md:block max-md:rounded-[22px] max-md:bg-surface max-md:p-3 max-md:shadow-[0_0_0_1px_var(--line)]">
              {columns.map((c) => <td role="cell" key={c.key} data-label={c.label} className="max-w-xs px-4 py-3 align-top max-md:flex max-md:max-w-none max-md:items-baseline max-md:justify-between max-md:gap-4 max-md:px-1 max-md:py-1.5 max-md:text-right max-md:before:shrink-0 max-md:before:text-left max-md:before:text-muted max-md:before:content-[attr(data-label)]">{display(c, r)}</td>)}
              {actions && <td role="cell" className="px-4 py-3 max-md:block max-md:px-1 max-md:pt-2 max-md:pb-0">{actions(r)}</td>}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
