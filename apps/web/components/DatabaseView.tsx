"use client";
import { useState } from "react";
import {
  addProperty, addRow, fromNotionCsv, queryView, removeProperty, removeRow, renameProperty, toNotionCsv, updateRow, valueText,
  type Database, type Filter, type FilterOp, type Property, type PropertyType, type Value,
} from "@blockwise/database";
import { updateDatabase, useApp, toast } from "@/lib/store";
import { download } from "@/lib/files";

const TYPES: PropertyType[] = ["text", "number", "select", "multi_select", "date", "checkbox", "url"];
const TYPE_ICON: Record<PropertyType, string> = { title: "Aa", text: "\u2261", number: "#", select: "\u25BE", multi_select: "\u2630", date: "\u{1F4C5}", checkbox: "\u2611", url: "\u{1F517}" };
const OPS: Record<PropertyType, FilterOp[]> = {
  title: ["contains", "does_not_contain", "equals", "is_empty", "is_not_empty"],
  text: ["contains", "does_not_contain", "equals", "is_empty", "is_not_empty"],
  url: ["contains", "is_empty", "is_not_empty"],
  number: ["equals", "does_not_equal", "greater_than", "less_than", "is_empty", "is_not_empty"],
  select: ["equals", "does_not_equal", "is_empty", "is_not_empty"],
  multi_select: ["contains", "does_not_contain", "is_empty", "is_not_empty"],
  date: ["before", "after", "equals", "is_empty", "is_not_empty"],
  checkbox: ["is_checked", "is_not_checked"],
};
const needsValue = (op: FilterOp) => !["is_empty", "is_not_empty", "is_checked", "is_not_checked"].includes(op);

export function DatabaseView({ id }: { id: string }) {
  const db = useApp((s) => s.ws.databases[id] as Database | undefined);
  const [newProp, setNewProp] = useState<{ name: string; type: PropertyType } | null>(null);
  if (!db) return <div className="db-missing">Database not found</div>;
  const view = db.views[0]!;
  const rows = queryView(db, view);
  const save = (next: Database) => updateDatabase(next);
  const setView = (patch: Partial<typeof view>) => save({ ...db, views: [{ ...view, ...patch }, ...db.views.slice(1)] });

  return (
    <div className="database" data-database={db.id}>
      <div className="db-head">
        <input className="db-title" aria-label="Database title" value={db.title} onChange={(e) => save({ ...db, title: e.target.value })} />
        <div className="db-tools">
          <button onClick={() => setView({ filters: [...view.filters, { property: "title", op: "contains", value: "" }] })}>Filter</button>
          <button onClick={() => setView({ sorts: [...view.sorts, { property: db.properties[0]!.id, direction: "ascending" }] })}>Sort</button>
          <button onClick={() => download(`${db.title || "Database"}.csv`, new Blob([toNotionCsv(db, rows)], { type: "text/csv" }))}>Export CSV</button>
          <label className="btn">Import CSV<input type="file" accept=".csv,text/csv" hidden onChange={async (e) => {
            const f = e.target.files?.[0];
            if (!f) return;
            const imported = fromNotionCsv(db.title, await f.text());
            save({ ...imported, id: db.id, title: db.title });
            toast(`Imported ${imported.rows.length} rows`);
          }} /></label>
        </div>
      </div>
      {(view.filters.length > 0 || view.sorts.length > 0) && (
        <div className="db-rules">
          {view.filters.length > 1 && (
            <select aria-label="Combine filters" value={view.conjunction} onChange={(e) => setView({ conjunction: e.target.value as "and" | "or" })}><option value="and">All filters</option><option value="or">Any filter</option></select>
          )}
          {view.filters.map((f, i) => <FilterRow key={i} db={db} f={f} onChange={(nf) => setView({ filters: view.filters.map((x, j) => (j === i ? nf : x)) })} onRemove={() => setView({ filters: view.filters.filter((_, j) => j !== i) })} />)}
          {view.sorts.map((s, i) => (
            <span className="rule" key={"s" + i}>
              Sort
              <select aria-label="Sort property" value={s.property} onChange={(e) => setView({ sorts: view.sorts.map((x, j) => (j === i ? { ...x, property: e.target.value } : x)) })}>{db.properties.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
              <select aria-label="Sort direction" value={s.direction} onChange={(e) => setView({ sorts: view.sorts.map((x, j) => (j === i ? { ...x, direction: e.target.value as "ascending" | "descending" } : x)) })}><option value="ascending">Ascending</option><option value="descending">Descending</option></select>
              <button aria-label="Remove sort" onClick={() => setView({ sorts: view.sorts.filter((_, j) => j !== i) })}>{"\u00D7"}</button>
            </span>
          ))}
        </div>
      )}
      <div className="db-scroll">
        <table className="db-table">
          <thead>
            <tr>
              {db.properties.map((p) => (
                <th key={p.id}>
                  <span className="ptype" title={p.type}>{TYPE_ICON[p.type]}</span>
                  <input aria-label="Property name" value={p.name} onChange={(e) => save(renameProperty(db, p.id, e.target.value))} />
                  {p.id !== "title" && <button className="pdel" aria-label={`Delete property ${p.name}`} onClick={() => save(removeProperty(db, p.id))}>{"\u00D7"}</button>}
                </th>
              ))}
              <th className="addcol">
                {newProp ? (
                  <form onSubmit={(e) => { e.preventDefault(); if (newProp.name.trim()) save(addProperty(db, newProp.name.trim(), newProp.type)); setNewProp(null); }}>
                    <input autoFocus aria-label="New property name" placeholder="Name" value={newProp.name} onChange={(e) => setNewProp({ ...newProp, name: e.target.value })} />
                    <select aria-label="New property type" value={newProp.type} onChange={(e) => setNewProp({ ...newProp, type: e.target.value as PropertyType })}>{TYPES.map((t) => <option key={t} value={t}>{t.replace("_", " ")}</option>)}</select>
                    <button type="submit">Add</button>
                  </form>
                ) : <button aria-label="Add property" onClick={() => setNewProp({ name: "", type: "text" })}>+</button>}
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                {db.properties.map((p) => <td key={p.id}><Cell p={p} v={r.values[p.id] ?? null} onChange={(v) => save(updateRow(db, r.id, p.id, v))} /></td>)}
                <td className="rowdel"><button aria-label="Delete row" onClick={() => save(removeRow(db, r.id))}>{"\u00D7"}</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <button className="db-add" onClick={() => save(addRow(db, { title: "" }))}>+ New</button>
      <span className="db-count">{rows.length} of {db.rows.length}</span>
    </div>
  );
}

function FilterRow({ db, f, onChange, onRemove }: { db: Database; f: Filter; onChange: (f: Filter) => void; onRemove: () => void }) {
  const p = db.properties.find((x) => x.id === f.property) ?? db.properties[0]!;
  return (
    <span className="rule">
      <select aria-label="Filter property" value={f.property} onChange={(e) => { const np = db.properties.find((x) => x.id === e.target.value)!; onChange({ property: np.id, op: OPS[np.type][0]!, value: "" }); }}>{db.properties.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select>
      <select aria-label="Filter condition" value={f.op} onChange={(e) => onChange({ ...f, op: e.target.value as FilterOp })}>{OPS[p.type].map((o) => <option key={o} value={o}>{o.replace(/_/g, " ")}</option>)}</select>
      {needsValue(f.op) && <input aria-label="Filter value" type={p.type === "number" ? "number" : p.type === "date" ? "date" : "text"} value={valueText(f.value ?? null)} onChange={(e) => onChange({ ...f, value: p.type === "number" ? Number(e.target.value) : e.target.value })} />}
      <button aria-label="Remove filter" onClick={onRemove}>{"\u00D7"}</button>
    </span>
  );
}

function Cell({ p, v, onChange }: { p: Property; v: Value; onChange: (v: Value) => void }) {
  switch (p.type) {
    case "checkbox": return <input type="checkbox" aria-label={p.name} checked={v === true} onChange={(e) => onChange(e.target.checked)} />;
    case "number": return <input className="cell-in num" type="number" aria-label={p.name} value={typeof v === "number" ? v : ""} onChange={(e) => onChange(e.target.value === "" ? null : Number(e.target.value))} />;
    case "date": {
      const start = v && typeof v === "object" && !Array.isArray(v) ? v.start.slice(0, 10) : "";
      return <input className="cell-in" type="date" aria-label={p.name} value={start} onChange={(e) => onChange(e.target.value ? { start: e.target.value } : null)} />;
    }
    case "select": return (
      <>
        <input className="cell-in" aria-label={p.name} list={"opts-" + p.id} value={typeof v === "string" ? v : ""} onChange={(e) => onChange(e.target.value || null)} />
        <datalist id={"opts-" + p.id}>{(p.options ?? []).map((o) => <option key={o.name} value={o.name} />)}</datalist>
        {typeof v === "string" && v && <span className={`tag c-${p.options?.find((o) => o.name === v)?.color ?? "gray"}`}>{v}</span>}
      </>
    );
    case "multi_select": return (
      <MultiCell p={p} v={Array.isArray(v) ? v : []} onChange={onChange} />
    );
    default: return <input className="cell-in" aria-label={p.name} value={typeof v === "string" ? v : valueText(v)} onChange={(e) => onChange(e.target.value)} />;
  }
}

function MultiCell({ p, v, onChange }: { p: Property; v: string[]; onChange: (v: Value) => void }) {
  const [draft, setDraft] = useState("");
  return (
    <div className="multi">
      {v.map((t) => <span key={t} className={`tag c-${p.options?.find((o) => o.name === t)?.color ?? "gray"}`}>{t}<button aria-label={`Remove ${t}`} onClick={() => onChange(v.filter((x) => x !== t))}>{"\u00D7"}</button></span>)}
      <input className="cell-in" aria-label={p.name} list={"opts-" + p.id} value={draft} placeholder="+" onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && draft.trim()) { onChange([...new Set([...v, draft.trim()])]); setDraft(""); } }} />
      <datalist id={"opts-" + p.id}>{(p.options ?? []).map((o) => <option key={o.name} value={o.name} />)}</datalist>
    </div>
  );
}
