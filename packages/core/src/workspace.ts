import type { Doc } from "./blocks.js";
import { createDoc } from "./doc.js";
import { plain } from "./rich-text.js";

/** A workspace is a tree of pages; every page is its own Doc. */
export interface Workspace {
  version: 1;
  pages: Record<string, Doc>;
  /** parent page id, or null for top level pages */
  parents: Record<string, string | null>;
  /** sibling order per parent ("" for top level) */
  order: Record<string, string[]>;
  /** small database records keyed by id, see @blockwise/database */
  databases: Record<string, unknown>;
}

export function emptyWorkspace(): Workspace {
  return { version: 1, pages: {}, parents: {}, order: { "": [] }, databases: {} };
}

export function addPage(ws: Workspace, doc: Doc, parent: string | null = null, index?: number): Workspace {
  const key = parent ?? "";
  const list = [...(ws.order[key] ?? [])];
  list.splice(index ?? list.length, 0, doc.rootId);
  return { ...ws, pages: { ...ws.pages, [doc.rootId]: doc }, parents: { ...ws.parents, [doc.rootId]: parent }, order: { ...ws.order, [key]: list } };
}

export function newPage(ws: Workspace, title = "Untitled", parent: string | null = null): [Workspace, string] {
  const doc = createDoc(title);
  return [addPage(ws, doc, parent), doc.rootId];
}

export function updatePage(ws: Workspace, doc: Doc): Workspace {
  return { ...ws, pages: { ...ws.pages, [doc.rootId]: doc } };
}

export function childPages(ws: Workspace, parent: string | null): string[] {
  return ws.order[parent ?? ""] ?? [];
}

export function descendants(ws: Workspace, id: string): string[] {
  return childPages(ws, id).flatMap((c) => [c, ...descendants(ws, c)]);
}

export function removePage(ws: Workspace, id: string): Workspace {
  const gone = new Set([id, ...descendants(ws, id)]);
  const pages = { ...ws.pages };
  const parents = { ...ws.parents };
  const order: Record<string, string[]> = {};
  for (const g of gone) { delete pages[g]; delete parents[g]; }
  for (const [k, v] of Object.entries(ws.order)) if (!gone.has(k)) order[k] = v.filter((x) => !gone.has(x));
  return { ...ws, pages, parents, order };
}

export function movePage(ws: Workspace, id: string, parent: string | null, index: number): Workspace {
  if (parent && (parent === id || descendants(ws, id).includes(parent))) throw new Error("cannot move a page under itself");
  const oldKey = ws.parents[id] ?? "";
  const order = { ...ws.order, [oldKey]: (ws.order[oldKey] ?? []).filter((x) => x !== id) };
  const key = parent ?? "";
  const list = [...(order[key] ?? [])];
  list.splice(Math.min(index, list.length), 0, id);
  order[key] = list;
  return { ...ws, order, parents: { ...ws.parents, [id]: parent } };
}

export function pageTitle(ws: Workspace, id: string): string {
  const d = ws.pages[id];
  return d ? plain(d.blocks[d.rootId]!.text) || "Untitled" : "Untitled";
}

export function breadcrumbs(ws: Workspace, id: string): string[] {
  const out: string[] = [];
  let cur: string | null = id;
  while (cur) { out.unshift(cur); cur = ws.parents[cur] ?? null; }
  return out;
}

export function searchPages(ws: Workspace, q: string): string[] {
  const needle = q.trim().toLowerCase();
  if (!needle) return [];
  return Object.keys(ws.pages).filter((id) => {
    const d = ws.pages[id]!;
    return Object.values(d.blocks).some((b) => plain(b.text).toLowerCase().includes(needle));
  });
}
