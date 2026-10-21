import { uuid } from "@blockwise/core";

export type PropertyType = "title" | "text" | "number" | "select" | "multi_select" | "date" | "checkbox" | "url";

export interface SelectOption { name: string; color: string }

export interface Property {
  id: string;
  name: string;
  type: PropertyType;
  options?: SelectOption[];
}

export type Value = string | number | boolean | string[] | { start: string; end?: string } | null;

export interface Row {
  id: string;
  values: Record<string, Value>;
}

export type FilterOp =
  | "contains" | "does_not_contain" | "equals" | "does_not_equal" | "is_empty" | "is_not_empty"
  | "greater_than" | "less_than" | "before" | "after" | "is_checked" | "is_not_checked";

export interface Filter { property: string; op: FilterOp; value?: Value }
export interface Sort { property: string; direction: "ascending" | "descending" }

export interface View {
  id: string;
  name: string;
  filters: Filter[];
  /** how filters combine */
  conjunction: "and" | "or";
  sorts: Sort[];
  hidden: string[];
}

export interface Database {
  id: string;
  title: string;
  properties: Property[];
  rows: Row[];
  views: View[];
}

const COLORS = ["gray", "brown", "orange", "yellow", "green", "blue", "purple", "pink", "red"];

export function optionColor(i: number): string { return COLORS[i % COLORS.length]!; }

export function createDatabase(title = "Untitled database"): Database {
  const titleProp: Property = { id: "title", name: "Name", type: "title" };
  return { id: uuid(), title, properties: [titleProp], rows: [], views: [{ id: uuid(), name: "Table", filters: [], conjunction: "and", sorts: [], hidden: [] }] };
}

export function addProperty(db: Database, name: string, type: PropertyType): Database {
  const p: Property = { id: uuid().slice(0, 8), name, type, ...(type === "select" || type === "multi_select" ? { options: [] } : {}) };
  return { ...db, properties: [...db.properties, p] };
}

export function renameProperty(db: Database, id: string, name: string): Database {
  return { ...db, properties: db.properties.map((p) => (p.id === id ? { ...p, name } : p)) };
}

export function removeProperty(db: Database, id: string): Database {
  if (id === "title") return db;
  return {
    ...db,
    properties: db.properties.filter((p) => p.id !== id),
    rows: db.rows.map((r) => { const v = { ...r.values }; delete v[id]; return { ...r, values: v }; }),
    views: db.views.map((v) => ({ ...v, filters: v.filters.filter((f) => f.property !== id), sorts: v.sorts.filter((s) => s.property !== id) })),
  };
}

export function addRow(db: Database, values: Record<string, Value> = {}): Database {
  return ensureOptions({ ...db, rows: [...db.rows, { id: uuid(), values }] });
}

export function updateRow(db: Database, rowId: string, prop: string, value: Value): Database {
  return ensureOptions({ ...db, rows: db.rows.map((r) => (r.id === rowId ? { ...r, values: { ...r.values, [prop]: value } } : r)) });
}

export function removeRow(db: Database, rowId: string): Database {
  return { ...db, rows: db.rows.filter((r) => r.id !== rowId) };
}

/** Select options are created on first use, like Notion. */
export function ensureOptions(db: Database): Database {
  const properties = db.properties.map((p) => {
    if (p.type !== "select" && p.type !== "multi_select") return p;
    const options = [...(p.options ?? [])];
    for (const r of db.rows) {
      const v = r.values[p.id];
      const names = Array.isArray(v) ? v : typeof v === "string" && v ? [v] : [];
      for (const n of names) if (!options.some((o) => o.name === n)) options.push({ name: n, color: optionColor(options.length) });
    }
    return options.length === (p.options ?? []).length ? p : { ...p, options };
  });
  return { ...db, properties };
}
