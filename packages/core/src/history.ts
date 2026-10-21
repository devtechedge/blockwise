import type { Doc } from "./blocks.js";
import { applyOp, invertOp, type Op } from "./doc.js";

export interface Transaction {
  ops: Op[];
  /** Transactions with the same non empty tag that arrive within `mergeWindowMs` merge into one undo step. */
  tag?: string;
  at: number;
}

export interface EditorState {
  doc: Doc;
  undo: Transaction[];
  redo: Transaction[];
}

export const mergeWindowMs = 800;
export const historyLimit = 500;

export function initState(doc: Doc): EditorState {
  return { doc, undo: [], redo: [] };
}

export function applyOps(doc: Doc, ops: Op[]): Doc {
  return ops.reduce(applyOp, doc);
}

/**
 * Builders take the doc as it is after the previous op, so a transaction can
 * be composed step by step: `commit(state, (d) => [...])` or pass ops directly.
 */
export function commit(state: EditorState, ops: Op[], tag?: string, now = Date.now()): EditorState {
  if (ops.length === 0) return state;
  const doc = applyOps(state.doc, ops);
  const last = state.undo[state.undo.length - 1];
  let undo: Transaction[];
  if (tag && last && last.tag === tag && now - last.at < mergeWindowMs) {
    undo = [...state.undo.slice(0, -1), { ops: [...last.ops, ...ops], tag, at: now }];
  } else {
    undo = [...state.undo, { ops, tag, at: now }].slice(-historyLimit);
  }
  return { doc, undo, redo: [] };
}

/** Apply ops one at a time where each op is built against the latest doc. */
export function commitSteps(state: EditorState, steps: ((doc: Doc) => Op | Op[] | null)[], tag?: string, now = Date.now()): EditorState {
  let doc = state.doc;
  const ops: Op[] = [];
  for (const step of steps) {
    const r = step(doc);
    if (!r) continue;
    for (const op of Array.isArray(r) ? r : [r]) { doc = applyOp(doc, op); ops.push(op); }
  }
  if (!ops.length) return state;
  return commit({ ...state, doc: state.doc }, ops, tag, now);
}

export function undo(state: EditorState): EditorState {
  const tx = state.undo[state.undo.length - 1];
  if (!tx) return state;
  const inverse = [...tx.ops].reverse().map(invertOp);
  return { doc: applyOps(state.doc, inverse), undo: state.undo.slice(0, -1), redo: [...state.redo, tx] };
}

export function redo(state: EditorState): EditorState {
  const tx = state.redo[state.redo.length - 1];
  if (!tx) return state;
  return { doc: applyOps(state.doc, tx.ops), undo: [...state.undo, tx], redo: state.redo.slice(0, -1) };
}
