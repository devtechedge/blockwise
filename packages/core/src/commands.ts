import type { BlockType, Doc } from "./blocks.js";
import { TEXT_TYPES } from "./blocks.js";
import { getBlock, indexInParent, opInsert, opMove, opRemove, opUpdate, type Op } from "./doc.js";
import { concat, length, splitAt, type Color, type RichText } from "./rich-text.js";
import { uuid } from "./ids.js";

/**
 * Editing commands return ops for one transaction plus where the caret should go.
 * They encode Notion like behaviour: Enter on an empty list item outdents or
 * turns it into a paragraph, Backspace at the start turns a block into text first.
 */
export interface CommandResult { ops: Op[]; focus?: { id: string; offset: number } }

const CONTINUING: ReadonlySet<BlockType> = new Set(["bulleted_list_item", "numbered_list_item", "to_do"]);

export function splitBlock(doc: Doc, id: string, offset: number): CommandResult {
  const b = getBlock(doc, id);
  if (!b.parent) return { ops: [] };
  if (CONTINUING.has(b.type) && length(b.text) === 0) {
    if (b.parent !== doc.rootId) return outdent(doc, id);
    return { ops: [opUpdate(doc, id, { type: "paragraph", props: {} })], focus: { id, offset: 0 } };
  }
  const [left, right] = splitAt(b.text, offset);
  const nextType: BlockType = CONTINUING.has(b.type) ? b.type : "paragraph";
  const newId = uuid();
  const ops: Op[] = [opUpdate(doc, id, { text: left })];
  const toggleOpen = b.type === "toggle" && b.children.length > 0;
  if (toggleOpen || (b.children.length > 0 && offset === length(b.text) && b.type !== "toggle")) {
    // New block becomes the first child, like Notion does for expanded parents.
    ops.push(opInsert(doc, id, 0, { id: newId, type: toggleOpen ? "paragraph" : nextType, text: right }));
  } else {
    const props = nextType === "to_do" ? { checked: false } : {};
    ops.push(opInsert(doc, b.parent, indexInParent(doc, id) + 1, { id: newId, type: nextType, text: right, props }));
  }
  return { ops, focus: { id: newId, offset: 0 } };
}

/** Block visually before `id` in document order that can take text, if any. */
export function previousTextBlock(doc: Doc, id: string): string | null {
  const b = getBlock(doc, id);
  if (!b.parent) return null;
  const sib = getBlock(doc, b.parent).children;
  const i = sib.indexOf(id);
  if (i === 0) return b.parent === doc.rootId ? null : (TEXT_TYPES.has(getBlock(doc, b.parent).type) ? b.parent : null);
  let cur = sib[i - 1]!;
  for (;;) {
    const c = getBlock(doc, cur);
    if (!c.children.length || c.type === "table" || c.type === "column_list") break;
    cur = c.children[c.children.length - 1]!;
  }
  return TEXT_TYPES.has(getBlock(doc, cur).type) ? cur : null;
}

export function backspaceAtStart(doc: Doc, id: string): CommandResult {
  const b = getBlock(doc, id);
  if (!b.parent) return { ops: [] };
  if (b.type !== "paragraph") return { ops: [opUpdate(doc, id, { type: "paragraph", props: {} })], focus: { id, offset: 0 } };
  if (b.parent !== doc.rootId && indexInParent(doc, id) === getBlock(doc, b.parent).children.length - 1) return outdent(doc, id);
  const prev = previousTextBlock(doc, id);
  if (!prev) {
    const sib = getBlock(doc, b.parent).children;
    const i = sib.indexOf(id);
    if (i > 0 && length(b.text) === 0) return { ops: [opRemove(doc, id)] };
    return { ops: [] };
  }
  const p = getBlock(doc, prev);
  const ops: Op[] = [opUpdate(doc, prev, { text: concat(p.text, b.text) })];
  let at = p.children.length;
  for (const c of b.children) ops.push({ op: "move", id: c, from: { parent: id, index: 0 }, to: { parent: prev, index: at++ } });
  ops.push({ op: "remove", parent: b.parent, index: indexInParent(doc, id), blocks: [{ ...b, children: [] }] });
  return { ops, focus: { id: prev, offset: length(p.text) } };
}

export function indent(doc: Doc, id: string): CommandResult {
  const b = getBlock(doc, id);
  if (!b.parent) return { ops: [] };
  const i = indexInParent(doc, id);
  if (i === 0) return { ops: [] };
  const prevId = getBlock(doc, b.parent).children[i - 1]!;
  const prev = getBlock(doc, prevId);
  if (!["paragraph", "to_do", "bulleted_list_item", "numbered_list_item", "toggle", "quote", "callout"].includes(prev.type)) return { ops: [] };
  return { ops: [opMove(doc, id, prevId, prev.children.length)], focus: { id, offset: -1 } };
}

export function outdent(doc: Doc, id: string): CommandResult {
  const b = getBlock(doc, id);
  if (!b.parent || b.parent === doc.rootId) return { ops: [] };
  const parent = getBlock(doc, b.parent);
  if (!parent.parent) return { ops: [] };
  const i = indexInParent(doc, id);
  const ops: Op[] = [];
  // Following siblings become children of the outdented block (Notion behaviour).
  const following = parent.children.slice(i + 1);
  let at = b.children.length;
  for (const f of following) ops.push({ op: "move", id: f, from: { parent: parent.id, index: i + 1 }, to: { parent: id, index: at++ } });
  ops.push({ op: "move", id, from: { parent: parent.id, index: i }, to: { parent: parent.parent, index: indexInParent(doc, parent.id) + 1 } });
  return { ops, focus: { id, offset: -1 } };
}

export function turnInto(doc: Doc, id: string, type: BlockType): CommandResult {
  const b = getBlock(doc, id);
  const base = type === "to_do" ? { checked: Boolean(b.props.checked) } : type === "code" ? { language: b.props.language ?? "plain text" } : type === "callout" ? { icon: b.props.icon ?? "\u{1F4A1}" } : {};
  const props = b.props.color ? { ...base, color: b.props.color } : base;
  return { ops: [opUpdate(doc, id, { type, props })], focus: { id, offset: -1 } };
}

/** Markdown shortcuts typed at the start of an empty-prefix block, e.g. "## " or "[] ". */
export const MARKDOWN_SHORTCUTS: [RegExp, BlockType, Record<string, unknown>?][] = [
  [/^#\s$/, "heading_1"], [/^##\s$/, "heading_2"], [/^###\s$/, "heading_3"],
  [/^[-*+]\s$/, "bulleted_list_item"], [/^1[.)]\s$/, "numbered_list_item"],
  [/^\[\s?\]\s$/, "to_do", { checked: false }], [/^\[x\]\s$/i, "to_do", { checked: true }],
  [/^>\s$/, "toggle"], [/^"\s$/, "quote"], [/^```$/, "code", { language: "plain text" }],
];

export function markdownShortcut(doc: Doc, id: string, typedPrefix: string): CommandResult | null {
  const b = getBlock(doc, id);
  if (b.type !== "paragraph") return null;
  if (/^(---|\*\*\*)$/.test(typedPrefix)) {
    const rest = splitAt(b.text, typedPrefix.length)[1];
    if (rest.length) return null;
    const newId = uuid();
    return { ops: [opUpdate(doc, id, { type: "divider", text: [] }), opInsert(doc, b.parent!, indexInParent(doc, id) + 1, { id: newId, type: "paragraph" })], focus: { id: newId, offset: 0 } };
  }
  for (const [re, type, props] of MARKDOWN_SHORTCUTS) {
    if (re.test(typedPrefix)) {
      const rest: RichText = splitAt(b.text, typedPrefix.length)[1];
      return { ops: [opUpdate(doc, id, { type, text: rest, props: { ...(props ?? {}) } })], focus: { id, offset: 0 } };
    }
  }
  return null;
}

export function duplicate(doc: Doc, id: string): CommandResult {
  const b = getBlock(doc, id);
  if (!b.parent) return { ops: [] };
  const clone = (bid: string): import("./blocks.js").BlockInput => {
    const x = getBlock(doc, bid);
    return { type: x.type, text: x.text, props: x.props, children: x.children.map(clone) };
  };
  const input = clone(id);
  const op = opInsert(doc, b.parent, indexInParent(doc, id) + 1, input);
  return { ops: [op], focus: { id: (op as { blocks: { id: string }[] }).blocks[0]!.id, offset: 0 } };
}

/** Set (or clear with "default") the block color of every listed block, as one batch of ops. */
export function setBlockColor(doc: Doc, ids: string[], color: Color | "default"): Op[] {
  return ids.map((id) => {
    const { color: _old, ...rest } = getBlock(doc, id).props;
    return opUpdate(doc, id, { props: color === "default" ? rest : { ...rest, color } });
  });
}
