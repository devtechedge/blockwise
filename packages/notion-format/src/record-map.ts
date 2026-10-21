import type { Block, BlockInput, BlockType, Doc, RichText } from "@blockwise/core";
import { getBlock, uuid } from "@blockwise/core";
import { fromTitle, toTitle, type TitleArray } from "./title.js";

/** Notion internal block type names, as found in the web bundle. */
export const TO_NOTION: Record<BlockType, string> = {
  paragraph: "text", heading_1: "header", heading_2: "sub_header", heading_3: "sub_sub_header",
  to_do: "to_do", bulleted_list_item: "bulleted_list", numbered_list_item: "numbered_list", toggle: "toggle",
  quote: "quote", callout: "callout", code: "code", divider: "divider", image: "image", equation: "equation",
  table: "table", table_row: "table_row", column_list: "column_list", column: "column", page: "page", database: "collection_view",
};
export const FROM_NOTION: Record<string, BlockType> = Object.fromEntries(Object.entries(TO_NOTION).map(([k, v]) => [v, k as BlockType]));

export interface NotionRecord {
  id: string;
  version?: number;
  type: string;
  properties?: Record<string, TitleArray>;
  format?: Record<string, unknown>;
  content?: string[];
  parent_id?: string;
  parent_table?: string;
  alive?: boolean;
  space_id?: string;
  created_time?: number;
  last_edited_time?: number;
}

export interface RecordMapV3 {
  __version__: 3;
  block: Record<string, { spaceId: string; value: { value: NotionRecord; role: string } }>;
}

export interface WriteOptions {
  spaceId?: string;
  /** Fresh ids so a paste never collides with existing blocks. Default true. */
  freshIds?: boolean;
  /** Fixed timestamp for deterministic output. */
  now?: number;
}

export const NEUTRAL_SPACE = "00000000-0000-4000-8000-000000000000";

const LANG_TO_NOTION: Record<string, string> = { javascript: "JavaScript", typescript: "TypeScript", python: "Python", json: "JSON", bash: "Bash", shell: "Shell", html: "HTML", css: "CSS", sql: "SQL", go: "Go", rust: "Rust", java: "Java", "plain text": "Plain Text", markdown: "Markdown", yaml: "YAML", c: "C", "c++": "C++", "c#": "C#", ruby: "Ruby", php: "PHP", swift: "Swift", kotlin: "Kotlin" };
export function notionLanguage(lang?: string): string { const l = (lang ?? "plain text").toLowerCase(); return LANG_TO_NOTION[l] ?? (lang ?? "Plain Text"); }
export function ourLanguage(lang?: string): string { return (lang ?? "Plain Text").toLowerCase(); }

function blockToRecord(b: Block, idOf: (id: string) => string, parentId: string, opts: Required<Pick<WriteOptions, "spaceId" | "now">>, doc: Doc): NotionRecord {
  const rec: NotionRecord = { id: idOf(b.id), version: 1, type: TO_NOTION[b.type], parent_id: parentId, parent_table: "block", alive: true, space_id: opts.spaceId, created_time: opts.now, last_edited_time: opts.now };
  const props: Record<string, TitleArray> = {};
  const format: Record<string, unknown> = {};
  const p = b.props;
  if (b.type === "equation") props.title = [[p.expression ?? ""]];
  else if (b.text.length) props.title = toTitle(b.text);
  if (b.type === "to_do") props.checked = [[p.checked ? "Yes" : "No"]];
  if (b.type === "code") props.language = [[notionLanguage(p.language)]];
  if (b.type === "image" && p.url) { props.source = [[p.url]]; format.display_source = p.url; }
  if (p.caption?.length) props.caption = toTitle(p.caption);
  if (p.color) format.block_color = p.color;
  if (b.type === "callout") format.page_icon = p.icon ?? "\u{1F4A1}";
  if (b.type === "page" && p.icon) format.page_icon = p.icon;
  if (b.type === "column" && p.ratio !== undefined) format.column_ratio = p.ratio;
  if (b.type === "table") {
    const width = p.width ?? 0;
    format.table_block_column_order = Array.from({ length: width }, (_, i) => columnKey(i));
    format.table_block_column_header = Boolean(p.hasColumnHeader);
    format.table_block_row_header = Boolean(p.hasRowHeader);
  }
  if (b.type === "table_row") (p.cells ?? []).forEach((c, i) => { props[columnKey(i)] = toTitle(c); });
  if (Object.keys(props).length) rec.properties = props;
  if (Object.keys(format).length) rec.format = format;
  if (b.children.length) rec.content = b.children.map(idOf);
  void doc;
  return rec;
}

/** Deterministic short column keys, the same shape as Notion's 4 character property ids. */
export function columnKey(i: number): string {
  const alphabet = "abcdefghijklmnopqrstuvwxyz0123456789";
  let n = i;
  let s = "";
  do { s = alphabet[n % 36] + s; n = Math.floor(n / 36); } while (n > 0);
  return ("col" + s).slice(-4).padStart(4, "c");
}

/** Build the record map for one top level block and its subtree. */
export function subtreeToRecordMap(doc: Doc, id: string, parentId: string, opts: WriteOptions = {}): { recordMap: RecordMapV3; rootId: string } {
  const spaceId = opts.spaceId ?? NEUTRAL_SPACE;
  const now = opts.now ?? Date.now();
  const fresh = opts.freshIds ?? true;
  const map = new Map<string, string>();
  const idOf = (x: string) => { if (!fresh) return x; let v = map.get(x); if (!v) { v = uuid(); map.set(x, v); } return v; };
  const recordMap: RecordMapV3 = { __version__: 3, block: {} };
  const walk = (bid: string, parent: string) => {
    const b = getBlock(doc, bid);
    const rec = blockToRecord(b, idOf, parent, { spaceId, now }, doc);
    recordMap.block[rec.id] = { spaceId, value: { value: rec, role: "editor" } };
    for (const c of b.children) walk(c, rec.id);
  };
  walk(id, parentId);
  return { recordMap, rootId: idOf(id) };
}

export function recordToInput(get: (id: string) => NotionRecord | undefined, id: string, seen = new Set<string>()): BlockInput | null {
  if (seen.has(id)) return null;
  seen.add(id);
  const r = get(id);
  if (!r || r.alive === false) return null;
  const type = FROM_NOTION[r.type];
  const props = r.properties ?? {};
  const format = r.format ?? {};
  const kids = (r.content ?? []).map((c) => recordToInput(get, c, seen)).filter((x): x is BlockInput => x !== null);
  if (!type) {
    // Unknown block types degrade to a paragraph that keeps their text.
    const t = fromTitle(props.title);
    return { type: "paragraph", text: t, ...(kids.length ? { children: kids } : {}) };
  }
  const input: BlockInput = { type };
  const p: NonNullable<BlockInput["props"]> = {};
  if (type === "equation") p.expression = fromTitle(props.title).map((s) => s.text).join("");
  else { const t = fromTitle(props.title); if (t.length) input.text = t; }
  if (type === "to_do") p.checked = String(props.checked?.[0]?.[0] ?? "No") === "Yes";
  if (type === "code") p.language = ourLanguage(String(props.language?.[0]?.[0] ?? "Plain Text"));
  if (type === "image") { const src = String(props.source?.[0]?.[0] ?? format.display_source ?? ""); if (src) p.url = src; }
  if (props.caption) { const c: RichText = fromTitle(props.caption); if (c.length) p.caption = c; }
  if (typeof format.block_color === "string" && format.block_color !== "default") p.color = format.block_color as never;
  if ((type === "callout" || type === "page") && typeof format.page_icon === "string") p.icon = format.page_icon;
  if (type === "column" && typeof format.column_ratio === "number") p.ratio = format.column_ratio;
  let children = kids;
  if (type === "table") {
    const order = (format.table_block_column_order as string[] | undefined) ?? [];
    p.width = order.length;
    p.hasColumnHeader = Boolean(format.table_block_column_header);
    p.hasRowHeader = Boolean(format.table_block_row_header);
    // Rows carry cells keyed by column id; rewrite them positionally.
    children = (r.content ?? []).map((rid): BlockInput | null => {
      const row = get(rid);
      if (!row) return null;
      return { type: "table_row", props: { cells: order.map((k) => fromTitle(row.properties?.[k])) } };
    }).filter((x): x is BlockInput => x !== null);
  }
  if (Object.keys(p).length) input.props = p;
  if (children.length && type !== "table_row") input.children = children;
  return input;
}

export function recordMapToInputs(recordMap: unknown, rootIds: string[]): BlockInput[] {
  const rm = recordMap as Partial<RecordMapV3> & { block?: Record<string, { value?: { value?: NotionRecord } | NotionRecord }> };
  const get = (id: string): NotionRecord | undefined => {
    const entry = rm.block?.[id];
    if (!entry) return undefined;
    const v = entry.value as { value?: NotionRecord } & NotionRecord;
    // Version 3 nests value.value; older maps have value directly.
    return v && "value" in v && v.value && typeof v.value === "object" ? v.value : (v as NotionRecord);
  };
  return rootIds.map((id) => recordToInput(get, id)).filter((x): x is BlockInput => x !== null);
}
