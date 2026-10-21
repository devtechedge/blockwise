"use client";
import {
  backspaceAtStart, duplicate, flatten, getBlock, indent, indexInParent, length, markdownShortcut, opInsert, opRemove,
  opUpdate, outdent, plain, splitBlock, turnInto, uuid, TEXT_TYPES, createDoc,
  type BlockInput, type BlockType, type Doc, type Op,
} from "@blockwise/core";
import { addPage, applyOp, deleteRange } from "@blockwise/core";
import { createDatabase, addProperty } from "@blockwise/database";
import { decodeClipboard, encodeClipboard, isInlinePaste, type ClipboardData } from "@blockwise/notion-format";
import { apply, currentDoc, getState, requestFocus, setSelection, setState, toast } from "./store";

const doc = (): Doc => currentDoc()!;

export function textBlocksInOrder(d: Doc): string[] {
  const out: string[] = [];
  const walk = (id: string) => {
    const b = getBlock(d, id);
    if (id !== d.rootId && TEXT_TYPES.has(b.type)) out.push(id);
    if (b.type === "table") return;
    for (const c of b.children) walk(c);
  };
  walk(d.rootId);
  return out;
}

export function focusSibling(id: string, dir: -1 | 1, atEnd = false): boolean {
  const d = doc();
  const list = textBlocksInOrder(d);
  const i = list.indexOf(id);
  const target = list[i + dir];
  if (!target) return false;
  requestFocus(target, atEnd || dir === -1 ? length(getBlock(d, target).text) : 0);
  return true;
}

export function run(result: { ops: Op[]; focus?: { id: string; offset: number } }, tag?: string): void {
  if (!result.ops.length) return;
  const f = result.focus;
  const after = f && f.offset < 0 ? { id: f.id, offset: Number.MAX_SAFE_INTEGER } : f;
  apply(result.ops, tag, after);
}

export const enter = (id: string, offset: number) => run(splitBlock(doc(), id, offset));
export const backspace = (id: string) => run(backspaceAtStart(doc(), id));
export const tab = (id: string, shift: boolean, offset: number) => {
  const r = shift ? outdent(doc(), id) : indent(doc(), id);
  run({ ...r, focus: r.ops.length ? { id, offset } : undefined });
};
export const shortcut = (id: string, prefix: string): boolean => {
  const r = markdownShortcut(doc(), id, prefix);
  if (!r) return false;
  run(r);
  return true;
};

export function setText(id: string, text: import("@blockwise/core").RichText, tag = "type:" + id): void {
  apply([opUpdate(doc(), id, { text })], tag);
}

export function setProps(id: string, props: Record<string, unknown>, focus?: { id: string; offset: number }): void {
  const b = getBlock(doc(), id);
  apply([opUpdate(doc(), id, { props: { ...b.props, ...props } })], undefined, focus);
}

function blockFor(type: BlockType | "page" | "database"): BlockInput | null {
  switch (type) {
    case "table": return { type: "table", props: { width: 2, hasColumnHeader: true, hasRowHeader: false }, children: [{ type: "table_row", props: { cells: [[], []] } }, { type: "table_row", props: { cells: [[], []] } }] };
    case "column_list": return { type: "column_list", children: [{ type: "column", props: { ratio: 0.5 }, children: [{ type: "paragraph" }] }, { type: "column", props: { ratio: 0.5 }, children: [{ type: "paragraph" }] }] };
    case "equation": return { type: "equation", props: { expression: "" } };
    case "image": return { type: "image", props: { url: "" } };
    case "divider": return { type: "divider" };
    default: return null;
  }
}

/** Slash command choice: transform the current block, or insert below when it still has text. */
export function chooseBlockType(id: string, type: BlockType | "page" | "database", slashStart: number, caret: number): void {
  const d = doc();
  const b = getBlock(d, id);
  const rest = plain(b.text).slice(0, slashStart) + plain(b.text).slice(caret);
  const cleaned = [...b.text];
  const ops: Op[] = [];
  const newText = deleteRange(cleaned, slashStart, caret);
  ops.push(opUpdate(d, id, { text: newText }));
  if (type === "page") {
    const st = getState();
    const page = createDoc("");
    setState({ ws: addPage(st.ws, page, st.current) }, true);
    apply(ops);
    toast("Sub page created in the sidebar");
    return;
  }
  if (type === "database") {
    let db = createDatabase("Untitled database");
    db = addProperty(db, "Tags", "multi_select");
    const st = getState();
    setState({ ws: { ...st.ws, databases: { ...st.ws.databases, [db.id]: db } } }, true);
    const input: BlockInput = { type: "database", text: [{ text: db.title }], props: { databaseId: db.id } };
    const d2 = doc();
    if (rest.trim() === "") { ops.push(opRemove(d2, id), opInsert(d2, b.parent!, indexInParent(d2, id), input)); }
    else ops.push(opInsert(d2, b.parent!, indexInParent(d2, id) + 1, input));
    apply(ops);
    return;
  }
  const special = blockFor(type);
  if (special) {
    const nid = uuid();
    const para = uuid();
    const at = indexInParent(d, id);
    if (rest.trim() === "") ops.push(opRemove(d, id), opInsert(d, b.parent!, at, { ...special, id: nid }));
    else ops.push(opInsert(d, b.parent!, at + 1, { ...special, id: nid }));
    const afterIndex = rest.trim() === "" ? at + 1 : at + 2;
    ops.push(opInsert(d, b.parent!, afterIndex, { id: para, type: "paragraph" }));
    const focusId = type === "column_list" ? null : para;
    apply(ops, undefined, focusId ? { id: focusId, offset: 0 } : undefined);
    return;
  }
  if (rest.trim() === "") {
    const r = turnInto(d, id, type as BlockType);
    apply([...ops, ...r.ops], undefined, { id, offset: slashStart });
  } else {
    const nid = uuid();
    apply([...ops, opInsert(d, b.parent!, indexInParent(d, id) + 1, { id: nid, type: type as BlockType, ...(type === "to_do" ? { props: { checked: false } } : type === "code" ? { props: { language: "plain text" } } : type === "callout" ? { props: { icon: "\u{1F4A1}" } } : {}) })], undefined, { id: nid, offset: 0 });
  }
}

// ---------- selection ----------

/** Selected ids in document order with descendants of selected blocks removed. */
export function topLevelSelection(d: Doc, ids: string[]): string[] {
  const set = new Set(ids);
  const order = flatten(d);
  return order.filter((id) => {
    if (!set.has(id)) return false;
    let p = getBlock(d, id).parent;
    while (p) { if (set.has(p)) return false; p = getBlock(d, p).parent; }
    return true;
  });
}

export function deleteSelection(): void {
  const d = doc();
  const ids = topLevelSelection(d, getState().selection);
  if (!ids.length) return;
  let cur = d;
  const ops: Op[] = [];
  for (const id of ids) { const op = opRemove(cur, id); ops.push(op); cur = applyOp(cur, op); }
  if (!getBlock(cur, cur.rootId).children.length) ops.push(opInsert(cur, cur.rootId, 0, { type: "paragraph" }));
  apply(ops);
  setSelection([]);
}

export function duplicateSelection(): void {
  const d = doc();
  const ids = topLevelSelection(d, getState().selection);
  const ops: Op[] = [];
  let cur = d;
  for (const id of [...ids].reverse()) { const r = duplicate(cur, id); for (const op of r.ops) { ops.push(op); cur = applyOp(cur, op); } }
  apply(ops);
}

export function moveSelection(dir: -1 | 1, extend: boolean): void {
  const d = doc();
  const order = flatten(d).filter((id) => getBlock(d, id).type !== "table_row" && getBlock(d, id).type !== "column");
  const sel = getState().selection;
  if (!sel.length) return;
  const anchor = dir === 1 ? sel[sel.length - 1]! : sel[0]!;
  const next = order[order.indexOf(anchor) + dir];
  if (!next) return;
  if (extend) setSelection(dir === 1 ? [...sel, next] : [next, ...sel]);
  else setSelection([next]);
}

// ---------- clipboard ----------

export function copySelection(e: ClipboardEvent, cut: boolean): boolean {
  const d = doc();
  const ids = topLevelSelection(d, getState().selection);
  if (!ids.length || !e.clipboardData) return false;
  e.preventDefault();
  const data = encodeClipboard(d, ids, { action: cut ? "cut" : "copy" });
  for (const [k, v] of Object.entries(data)) {
    try { e.clipboardData.setData(k, v); } catch { /* some browsers reject custom types */ }
  }
  if (cut) deleteSelection();
  toast(`${cut ? "Cut" : "Copied"} ${ids.length} block${ids.length === 1 ? "" : "s"}`);
  return true;
}

export function readClipboard(dt: DataTransfer): ClipboardData {
  const data: ClipboardData = {};
  for (const t of Array.from(dt.types)) { if (t === "Files") continue; const v = dt.getData(t); if (v) data[t] = v; }
  return data;
}

/** Paste blocks after `afterId` (or replace it when it is an empty paragraph). */
export function pasteBlocks(data: ClipboardData, afterId: string): boolean {
  const d = doc();
  const { blocks, source } = decodeClipboard(data);
  if (!blocks.length) return false;
  const b = getBlock(d, afterId);
  const parent = b.parent ?? d.rootId;
  let at = indexInParent(d, afterId) + 1;
  const ops: Op[] = [];
  let cur = d;
  if (b.type === "paragraph" && plain(b.text) === "" && !b.children.length) { const op = opRemove(cur, afterId); ops.push(op); cur = applyOp(cur, op); at--; }
  let lastId = "";
  for (const input of blocks) { const op = opInsert(cur, parent, at++, input); ops.push(op); cur = applyOp(cur, op); lastId = (op as { blocks: { id: string }[] }).blocks[0]!.id; }
  const last = getBlock(cur, lastId);
  apply(ops, undefined, TEXT_TYPES.has(last.type) ? { id: lastId, offset: length(last.text) } : undefined);
  toast(`Pasted ${blocks.length} block${blocks.length === 1 ? "" : "s"} from ${source === "notion-blocks" ? "Notion block data" : source === "html" ? "HTML" : "text"}`);
  return true;
}

export { isInlinePaste };
