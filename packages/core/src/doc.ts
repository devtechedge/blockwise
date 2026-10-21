import type { Block, BlockInput, BlockProps, BlockType, Doc } from "./blocks.js";
import { uuid } from "./ids.js";
import type { RichText } from "./rich-text.js";
import { normalize, text as mkText } from "./rich-text.js";

export function createDoc(title = "Untitled", id = uuid()): Doc {
  return { rootId: id, blocks: { [id]: { id, type: "page", text: mkText(title), props: {}, children: [], parent: null } } };
}

export function getBlock(doc: Doc, id: string): Block {
  const b = doc.blocks[id];
  if (!b) throw new Error(`unknown block ${id}`);
  return b;
}

/** Flatten an input tree into blocks (parent pointers filled in). */
export function materialize(input: BlockInput, parent: string | null): Block[] {
  const id = input.id ?? uuid();
  const kids = (input.children ?? []).map((c) => materialize(c, id));
  const block: Block = {
    id,
    type: input.type,
    text: normalize(input.text ?? []),
    props: { ...(input.props ?? {}) },
    children: kids.map((k) => k[0]!.id),
    parent,
  };
  return [block, ...kids.flat()];
}

export function buildDoc(title: string, children: BlockInput[], id?: string): Doc {
  const doc = createDoc(title, id);
  const root = doc.blocks[doc.rootId]!;
  for (const c of children) {
    const blocks = materialize(c, root.id);
    root.children.push(blocks[0]!.id);
    for (const b of blocks) doc.blocks[b.id] = b;
  }
  return doc;
}

/** Back to the nested input form; inverse of materialize. */
export function toInput(doc: Doc, id: string, keepIds = true): BlockInput {
  const b = getBlock(doc, id);
  const out: BlockInput = { type: b.type };
  if (keepIds) out.id = b.id;
  if (b.text.length) out.text = b.text;
  if (Object.keys(b.props).length) out.props = b.props;
  if (b.children.length) out.children = b.children.map((c) => toInput(doc, c, keepIds));
  return out;
}

export function subtree(doc: Doc, id: string): Block[] {
  const b = getBlock(doc, id);
  return [b, ...b.children.flatMap((c) => subtree(doc, c))];
}

/** Depth first order of all blocks under the root, excluding the root. */
export function flatten(doc: Doc, from = doc.rootId): string[] {
  return getBlock(doc, from).children.flatMap((c) => [c, ...flatten(doc, c)]);
}

export function indexInParent(doc: Doc, id: string): number {
  const b = getBlock(doc, id);
  if (!b.parent) return -1;
  return getBlock(doc, b.parent).children.indexOf(id);
}

export function depth(doc: Doc, id: string): number {
  let d = 0;
  let b = getBlock(doc, id);
  while (b.parent && b.parent !== doc.rootId) { d++; b = getBlock(doc, b.parent); }
  return d;
}

/** Numbered list position, counting consecutive numbered siblings (Notion behaviour). */
export function listNumber(doc: Doc, id: string): number {
  const b = getBlock(doc, id);
  if (!b.parent) return 1;
  const sib = getBlock(doc, b.parent).children;
  let n = 1;
  for (let i = sib.indexOf(id) - 1; i >= 0 && doc.blocks[sib[i]!]?.type === "numbered_list_item"; i--) n++;
  return n;
}

// ---------- operations ----------

export type Op =
  | { op: "insert"; parent: string; index: number; blocks: Block[] }
  | { op: "remove"; parent: string; index: number; blocks: Block[] }
  | { op: "update"; id: string; before: Partial<Pick<Block, "type" | "text" | "props">>; after: Partial<Pick<Block, "type" | "text" | "props">> }
  | { op: "move"; id: string; from: { parent: string; index: number }; to: { parent: string; index: number } };

function withBlock(blocks: Record<string, Block>, b: Block): void { blocks[b.id] = b; }

export function applyOp(doc: Doc, op: Op): Doc {
  const blocks = { ...doc.blocks };
  switch (op.op) {
    case "insert": {
      const parent = { ...getBlock(doc, op.parent), children: [...getBlock(doc, op.parent).children] };
      const head = op.blocks[0]!;
      parent.children.splice(op.index, 0, head.id);
      withBlock(blocks, parent);
      for (const b of op.blocks) withBlock(blocks, b.id === head.id ? { ...b, parent: op.parent } : b);
      break;
    }
    case "remove": {
      const parent = { ...getBlock(doc, op.parent), children: [...getBlock(doc, op.parent).children] };
      const head = op.blocks[0]!;
      const at = parent.children.indexOf(head.id);
      if (at < 0) throw new Error(`block ${head.id} not under ${op.parent}`);
      parent.children.splice(at, 1);
      withBlock(blocks, parent);
      for (const b of op.blocks) delete blocks[b.id];
      break;
    }
    case "update": {
      withBlock(blocks, { ...getBlock(doc, op.id), ...op.after });
      break;
    }
    case "move": {
      const from = { ...getBlock(doc, op.from.parent), children: [...getBlock(doc, op.from.parent).children] };
      from.children.splice(from.children.indexOf(op.id), 1);
      withBlock(blocks, from);
      const toBase = op.to.parent === op.from.parent ? from : getBlock({ ...doc, blocks }, op.to.parent);
      const to = { ...toBase, children: [...toBase.children] };
      to.children.splice(op.to.index, 0, op.id);
      withBlock(blocks, to);
      withBlock(blocks, { ...getBlock(doc, op.id), parent: op.to.parent });
      break;
    }
  }
  return { ...doc, blocks };
}

export function invertOp(op: Op): Op {
  switch (op.op) {
    case "insert": return { ...op, op: "remove" };
    case "remove": return { ...op, op: "insert" };
    case "update": return { op: "update", id: op.id, before: op.after, after: op.before };
    case "move": return { op: "move", id: op.id, from: op.to, to: op.from };
  }
}

// ---------- op builders ----------

export function opInsert(doc: Doc, parent: string, index: number, input: BlockInput): Op {
  return { op: "insert", parent, index, blocks: materialize(input, parent) };
}

export function opRemove(doc: Doc, id: string): Op {
  const b = getBlock(doc, id);
  if (!b.parent) throw new Error("cannot remove the root");
  return { op: "remove", parent: b.parent, index: indexInParent(doc, id), blocks: subtree(doc, id) };
}

export function opUpdate(doc: Doc, id: string, patch: { type?: BlockType; text?: RichText; props?: BlockProps }): Op {
  const b = getBlock(doc, id);
  const before: Op & { op: "update" } = { op: "update", id, before: {}, after: {} };
  if (patch.type !== undefined) { before.before.type = b.type; before.after.type = patch.type; }
  if (patch.text !== undefined) { before.before.text = b.text; before.after.text = normalize(patch.text); }
  if (patch.props !== undefined) { before.before.props = b.props; before.after.props = patch.props; }
  return before;
}

function isAncestor(doc: Doc, maybeAncestor: string, id: string): boolean {
  let cur: string | null = id;
  while (cur) { if (cur === maybeAncestor) return true; cur = doc.blocks[cur]?.parent ?? null; }
  return false;
}

export function opMove(doc: Doc, id: string, parent: string, index: number): Op {
  const b = getBlock(doc, id);
  if (!b.parent) throw new Error("cannot move the root");
  if (isAncestor(doc, id, parent)) throw new Error("cannot move a block into itself");
  const fromIndex = indexInParent(doc, id);
  let toIndex = index;
  if (parent === b.parent && index > fromIndex) toIndex = index - 1;
  return { op: "move", id, from: { parent: b.parent, index: fromIndex }, to: { parent, index: toIndex } };
}
