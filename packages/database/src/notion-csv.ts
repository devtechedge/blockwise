import { uuid } from "@blockwise/core";
import { parseCsv, writeCsv } from "./csv.js";
import { ensureOptions, type Database, type Property, type PropertyType, type Row, type Value } from "./model.js";

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

/** Notion CSV exports write dates as "October 21, 2026" (and "October 21, 2026 3:30 PM"). */
export function formatNotionDate(iso: string): string {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?/);
  if (!m) return iso;
  const base = `${MONTHS[Number(m[2]) - 1]} ${Number(m[3])}, ${m[1]}`;
  if (!m[4]) return base;
  const h = Number(m[4]);
  return `${base} ${((h + 11) % 12) + 1}:${m[5]} ${h < 12 ? "AM" : "PM"}`;
}

export function parseNotionDate(s: string): string | null {
  const t = s.trim();
  if (/^\d{4}-\d{2}-\d{2}(T[\d:.]+Z?)?$/.test(t)) return t;
  const m = t.match(/^([A-Z][a-z]+) (\d{1,2}), (\d{4})(?: (\d{1,2}):(\d{2}) (AM|PM))?$/);
  if (!m) return null;
  const mo = MONTHS.indexOf(m[1]!);
  if (mo < 0) return null;
  const date = `${m[3]}-${String(mo + 1).padStart(2, "0")}-${m[2]!.padStart(2, "0")}`;
  if (!m[4]) return date;
  let h = Number(m[4]) % 12;
  if (m[6] === "PM") h += 12;
  return `${date}T${String(h).padStart(2, "0")}:${m[5]}`;
}

function cellOut(v: Value, p: Property): string {
  if (v === null || v === undefined) return "";
  switch (p.type) {
    case "checkbox": return v === true ? "Yes" : "No";
    case "multi_select": return Array.isArray(v) ? v.join(", ") : String(v);
    case "date": {
      if (typeof v === "object" && !Array.isArray(v)) return v.end ? `${formatNotionDate(v.start)} \u2192 ${formatNotionDate(v.end)}` : formatNotionDate(v.start);
      return formatNotionDate(String(v));
    }
    default: return Array.isArray(v) ? v.join(", ") : String(v);
  }
}

export function toNotionCsv(db: Database, rows: Row[] = db.rows): string {
  const props = db.properties;
  return writeCsv([props.map((p) => p.name), ...rows.map((r) => props.map((p) => cellOut(r.values[p.id] ?? null, p)))]);
}

function cellIn(s: string, type: PropertyType): Value {
  if (s === "") return type === "checkbox" ? false : type === "multi_select" ? [] : null;
  switch (type) {
    case "checkbox": return s === "Yes";
    case "number": return Number(s.replace(/,/g, ""));
    case "multi_select": return s.split(/,\s*/).filter(Boolean);
    case "date": {
      const [a, b] = s.split(" \u2192 ");
      const start = parseNotionDate(a!) ?? a!;
      const end = b ? parseNotionDate(b) ?? b : undefined;
      return end ? { start, end } : { start };
    }
    default: return s;
  }
}

/** Guess a column's type from its values, the way an import has to. */
export function inferType(values: string[], header: string): PropertyType {
  const vals = values.filter((v) => v !== "");
  if (!vals.length) return "text";
  if (vals.every((v) => v === "Yes" || v === "No")) return "checkbox";
  if (vals.every((v) => /^-?[\d,]*\.?\d+$/.test(v))) return "number";
  if (vals.every((v) => v.split(" \u2192 ").every((p) => parseNotionDate(p) !== null))) return "date";
  if (vals.every((v) => /^https?:\/\/\S+$/.test(v))) return "url";
  if (vals.some((v) => v.includes(", ")) && /tag|label|categor/i.test(header)) return "multi_select";
  const distinct = new Set(vals);
  if (vals.length >= 3 && distinct.size < vals.length && distinct.size <= Math.max(3, Math.ceil(vals.length * 0.75)) && [...distinct].every((v) => v.length <= 40)) return "select";
  return "text";
}

export function fromNotionCsv(title: string, csv: string, types: Record<string, PropertyType> = {}): Database {
  const [header = [], ...body] = parseCsv(csv).filter((r) => r.length > 1 || r[0] !== "");
  const properties: Property[] = header.map((name, i) => {
    const type: PropertyType = i === 0 ? "title" : types[name] ?? inferType(body.map((r) => r[i] ?? ""), name);
    return { id: i === 0 ? "title" : `p${i}`, name, type, ...(type === "select" || type === "multi_select" ? { options: [] } : {}) };
  });
  const rows: Row[] = body.map((r) => ({ id: uuid(), values: Object.fromEntries(properties.map((p, i) => [p.id, cellIn(r[i] ?? "", p.type)])) }));
  return ensureOptions({ id: uuid(), title, properties, rows, views: [{ id: uuid(), name: "Table", filters: [], conjunction: "and", sorts: [], hidden: [] }] });
}
