"use client";
import { useSyncExternalStore } from "react";
import {
  addPage, autosave, commit, createDoc, emptyWorkspace, indexedDbStorage, memoryStorage, newPage as wsNewPage,
  redo as historyRedo, removePage, undo as historyUndo, updatePage, movePage as wsMovePage,
  type Doc, type Op, type Storage, type Transaction, type Workspace,
} from "@blockwise/core";
import type { Database } from "@blockwise/database";
import { seedWorkspace } from "./seed";

export interface FocusRequest { id: string; offset: number; seq: number }

export interface AppState {
  ready: boolean;
  ws: Workspace;
  current: string | null;
  history: Record<string, { undo: Transaction[]; redo: Transaction[] }>;
  selection: string[];
  focus: FocusRequest | null;
  theme: "light" | "dark";
  toast: { text: string; seq: number } | null;
}

let state: AppState = { ready: false, ws: emptyWorkspace(), current: null, history: {}, selection: [], focus: null, theme: "light", toast: null };
const listeners = new Set<() => void>();
let storage: Storage = memoryStorage();
let saver = autosave(storage);
let seq = 0;

function emit() { for (const l of listeners) l(); }

export function getState(): AppState { return state; }

export function setState(patch: Partial<AppState>, persist = false): void {
  state = { ...state, ...patch };
  if (persist) saver.schedule(state.ws);
  emit();
}

export function subscribe(l: () => void): () => void { listeners.add(l); return () => listeners.delete(l); }

export function useApp<T>(select: (s: AppState) => T): T {
  return useSyncExternalStore(subscribe, () => select(state), () => select(state));
}

export async function boot(): Promise<void> {
  if (state.ready) return;
  try { storage = indexedDbStorage(); await storage.load(); } catch { storage = memoryStorage(); }
  saver = autosave(storage);
  let ws = await storage.load().catch(() => null);
  if (!ws || !Object.keys(ws.pages).length) { ws = seedWorkspace(); await storage.save(ws); }
  const theme = (localStorage.getItem("blockwise-theme") as "light" | "dark" | null) ?? (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
  const fromHash = decodeURIComponent(location.hash.slice(1));
  const current = ws.pages[fromHash] ? fromHash : ws.order[""]?.[0] ?? null;
  setState({ ready: true, ws, current, theme });
}

export async function flush(): Promise<void> { await saver.flush(); }

export function requestFocus(id: string, offset: number): void {
  setState({ focus: { id, offset, seq: ++seq } });
}

export function toast(text: string): void { setState({ toast: { text, seq: ++seq } }); }

export function currentDoc(): Doc | null {
  return state.current ? state.ws.pages[state.current] ?? null : null;
}

/** Apply ops to the current page as one undoable transaction. */
export function apply(ops: Op[], tag?: string, focus?: { id: string; offset: number }): void {
  const id = state.current;
  if (!id || !ops.length) return;
  const doc = state.ws.pages[id]!;
  const h = state.history[id] ?? { undo: [], redo: [] };
  const next = commit({ doc, undo: h.undo, redo: h.redo }, ops, tag);
  state = { ...state, ws: updatePage(state.ws, next.doc), history: { ...state.history, [id]: { undo: next.undo, redo: next.redo } } };
  if (focus) state = { ...state, focus: { ...focus, seq: ++seq } };
  saver.schedule(state.ws);
  emit();
}

function step(kind: "undo" | "redo"): void {
  const id = state.current;
  if (!id) return;
  const doc = state.ws.pages[id]!;
  const h = state.history[id] ?? { undo: [], redo: [] };
  const next = (kind === "undo" ? historyUndo : historyRedo)({ doc, undo: h.undo, redo: h.redo });
  if (next.doc === doc) return;
  setState({ ws: updatePage(state.ws, next.doc), history: { ...state.history, [id]: { undo: next.undo, redo: next.redo } }, selection: [] }, true);
}
export const undo = () => step("undo");
export const redo = () => step("redo");

export function openPage(id: string): void {
  if (!state.ws.pages[id]) return;
  history.replaceState(null, "", "#" + encodeURIComponent(id));
  setState({ current: id, selection: [] });
}

export function createPage(parent: string | null = null, title = ""): string {
  const [ws, id] = wsNewPage(state.ws, title, parent);
  setState({ ws }, true);
  openPage(id);
  return id;
}

export function addDoc(doc: Doc, parent: string | null = null): void {
  setState({ ws: addPage(state.ws, doc, parent) }, true);
}

export function deletePage(id: string): void {
  const ws = removePage(state.ws, id);
  const current = ws.pages[state.current ?? ""] ? state.current : ws.order[""]?.[0] ?? null;
  setState({ ws, current }, true);
  if (!current) createPage(null, "Untitled");
}

export function movePage(id: string, parent: string | null, index: number): void {
  try { setState({ ws: wsMovePage(state.ws, id, parent, index) }, true); } catch { /* moving under itself is ignored */ }
}

export function replaceWorkspace(ws: Workspace): void {
  setState({ ws, history: {}, current: ws.order[""]?.[0] ?? null, selection: [] }, true);
}

export function mergeWorkspace(ws: Workspace): string | null {
  let merged = state.ws;
  for (const id of ws.order[""] ?? []) {
    const walk = (pid: string, parent: string | null) => {
      merged = addPage(merged, ws.pages[pid]!, parent);
      for (const c of ws.order[pid] ?? []) walk(c, pid);
    };
    walk(id, null);
  }
  merged = { ...merged, databases: { ...merged.databases, ...ws.databases } };
  setState({ ws: merged }, true);
  return ws.order[""]?.[0] ?? null;
}

export function updateDatabase(db: Database): void {
  setState({ ws: { ...state.ws, databases: { ...state.ws.databases, [db.id]: db } } }, true);
}

export function setTheme(theme: "light" | "dark"): void {
  localStorage.setItem("blockwise-theme", theme);
  setState({ theme });
}

export function setSelection(ids: string[]): void { setState({ selection: ids }); }

export async function resetWorkspace(): Promise<void> {
  const ws = seedWorkspace();
  replaceWorkspace(ws);
  await flush();
}

export function blankDoc(title: string): Doc { return createDoc(title); }
