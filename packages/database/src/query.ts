import type { Database, Filter, Property, Row, Sort, Value, View } from "./model.js";

export function valueText(v: Value): string {
  if (v === null || v === undefined) return "";
  if (Array.isArray(v)) return v.join(", ");
  if (typeof v === "object") return v.end ? `${v.start} \u2192 ${v.end}` : v.start;
  if (typeof v === "boolean") return v ? "Yes" : "No";
  return String(v);
}

function isEmpty(v: Value): boolean {
  return v === null || v === undefined || v === "" || (Array.isArray(v) && v.length === 0);
}

function dateOf(v: Value): string | null {
  if (v && typeof v === "object" && !Array.isArray(v)) return v.start;
  if (typeof v === "string" && /^\d{4}-\d{2}-\d{2}/.test(v)) return v;
  return null;
}

export function matches(row: Row, f: Filter, prop: Property | undefined): boolean {
  const v = row.values[f.property] ?? null;
  const target = f.value ?? null;
  switch (f.op) {
    case "is_empty": return isEmpty(v);
    case "is_not_empty": return !isEmpty(v);
    case "is_checked": return v === true;
    case "is_not_checked": return v !== true;
    case "contains":
      if (Array.isArray(v)) return v.includes(String(target));
      return valueText(v).toLowerCase().includes(valueText(target).toLowerCase());
    case "does_not_contain":
      if (Array.isArray(v)) return !v.includes(String(target));
      return !valueText(v).toLowerCase().includes(valueText(target).toLowerCase());
    case "equals":
      if (prop?.type === "number") return Number(v) === Number(target);
      return valueText(v) === valueText(target);
    case "does_not_equal":
      if (prop?.type === "number") return Number(v) !== Number(target);
      return valueText(v) !== valueText(target);
    case "greater_than": return !isEmpty(v) && Number(v) > Number(target);
    case "less_than": return !isEmpty(v) && Number(v) < Number(target);
    case "before": { const a = dateOf(v); const b = dateOf(target); return Boolean(a && b && a < b); }
    case "after": { const a = dateOf(v); const b = dateOf(target); return Boolean(a && b && a > b); }
  }
}

function compare(a: Value, b: Value, prop: Property | undefined): number {
  // Empty values sort last in both directions, like Notion.
  if (isEmpty(a) && isEmpty(b)) return 0;
  if (isEmpty(a)) return 1;
  if (isEmpty(b)) return -1;
  if (prop?.type === "number") return Number(a) - Number(b);
  if (prop?.type === "checkbox") return Number(a === true) - Number(b === true);
  if (prop?.type === "date") return (dateOf(a) ?? "").localeCompare(dateOf(b) ?? "");
  if (prop?.type === "select" && prop.options) {
    const ia = prop.options.findIndex((o) => o.name === a);
    const ib = prop.options.findIndex((o) => o.name === b);
    return ia - ib;
  }
  return valueText(a).localeCompare(valueText(b), undefined, { numeric: true, sensitivity: "base" });
}

export function sortRows(rows: Row[], sorts: Sort[], db: Database): Row[] {
  if (!sorts.length) return rows;
  const props = new Map(db.properties.map((p) => [p.id, p]));
  return rows.map((r, i) => [r, i] as const).sort(([a, ia], [b, ib]) => {
    for (const s of sorts) {
      const p = props.get(s.property);
      const av = a.values[s.property] ?? null;
      const bv = b.values[s.property] ?? null;
      if (isEmpty(av) !== isEmpty(bv)) return isEmpty(av) ? 1 : -1;
      const c = compare(av, bv, p);
      if (c !== 0) return s.direction === "ascending" ? c : -c;
    }
    return ia - ib; // stable
  }).map(([r]) => r);
}

export function queryView(db: Database, view: Pick<View, "filters" | "sorts" | "conjunction">): Row[] {
  const props = new Map(db.properties.map((p) => [p.id, p]));
  const pass = (r: Row) => {
    if (!view.filters.length) return true;
    const results = view.filters.map((f) => matches(r, f, props.get(f.property)));
    return view.conjunction === "or" ? results.some(Boolean) : results.every(Boolean);
  };
  return sortRows(db.rows.filter(pass), view.sorts, db);
}
