import type { BlockInput, Doc } from "@blockwise/core";
import { buildDoc, getBlock, plain, toInput } from "@blockwise/core";
import { blocksToHtml, htmlToBlocks } from "./html.js";
import { blocksToMarkdown, markdownToBlocks } from "./markdown.js";
import { recordMapToInputs, subtreeToRecordMap, type RecordMapV3, type WriteOptions } from "./record-map.js";

/** MIME keys observed in Notion's web editor (docs/specs/clipboard.md). */
export const NOTION_BLOCKS_MIME = "text/_notion-blocks-v3-production";
export const NOTION_TEXT_MIME = "text/_notion-text-production";
export const NOTION_MULTI_TEXT_MIME = "text/_notion-multi-text-production";
export const NOTION_PAGE_SOURCE_MIME = "text/_notion-page-source-production";
export const NOTION_PRIVATE_MIMES = [NOTION_BLOCKS_MIME, NOTION_TEXT_MIME, NOTION_MULTI_TEXT_MIME, NOTION_PAGE_SOURCE_MIME] as const;

export interface BlockSelectionPayload {
  blocks: { blockId: string; blockSubtree: RecordMapV3 }[];
  action: "copy" | "cut";
  wasContiguousSelection: boolean;
  wasSelectionFromSnapshot?: boolean;
}

export type ClipboardData = Record<string, string>;

export interface EncodeOptions extends WriteOptions {
  /** Parent block id written into the records, defaults to the doc root. */
  parentId?: string;
  action?: "copy" | "cut";
}

/** Serialise selected top level blocks the way Notion's copy handler does. */
export function encodeClipboard(doc: Doc, ids: string[], opts: EncodeOptions = {}): ClipboardData {
  const parentId = opts.parentId ?? doc.rootId;
  const blocks = ids.map((id) => {
    const { recordMap, rootId } = subtreeToRecordMap(doc, id, parentId, opts);
    return { blockId: rootId, blockSubtree: recordMap };
  });
  const parent = getBlock(doc, getBlock(doc, ids[0]!).parent ?? doc.rootId).children;
  const at = parent.indexOf(ids[0]!);
  const contiguous = ids.every((id, i) => parent[at + i] === id);
  const payload: BlockSelectionPayload = { blocks, action: opts.action ?? "copy", wasContiguousSelection: contiguous };
  const inputs = ids.map((id) => toInput(doc, id, false));
  return {
    "text/plain": blocksToMarkdown(inputs).replace(/\n$/, ""),
    "text/html": blocksToHtml(inputs),
    [NOTION_BLOCKS_MIME]: JSON.stringify(payload),
  };
}

/** Encode loose block inputs (no doc yet), e.g. for tests and the demo. */
export function encodeInputs(inputs: BlockInput[], opts: EncodeOptions = {}): ClipboardData {
  const doc = buildDoc("", inputs);
  return encodeClipboard(doc, getBlock(doc, doc.rootId).children, opts);
}

export type ClipboardSource = "notion-blocks" | "html" | "markdown" | "empty";

export function parseBlockSelection(json: string): BlockSelectionPayload | null {
  try {
    const v = JSON.parse(json) as BlockSelectionPayload;
    if (!v || !Array.isArray(v.blocks)) return null;
    return v;
  } catch {
    return null; // Notion also ignores payloads it cannot parse
  }
}

const LOOKS_LIKE_MARKDOWN = /(^|\n)\s*(#{1,3} |[-*+] |\d+[.)] |> |```|\|.*\||- \[[ xX]\] )/;

/**
 * Pick the richest representation available, in the order Notion reads them:
 * private block payload, then HTML (when it has formatting), then text.
 */
export function decodeClipboard(data: ClipboardData, opts: { keepIds?: boolean } = {}): { blocks: BlockInput[]; source: ClipboardSource } {
  const json = data[NOTION_BLOCKS_MIME];
  if (json) {
    const payload = parseBlockSelection(json);
    if (payload) {
      const blocks = payload.blocks.flatMap((b) => recordMapToInputs(b.blockSubtree, [b.blockId], opts.keepIds));
      if (blocks.length) return { blocks, source: "notion-blocks" };
    }
  }
  const html = data["text/html"];
  if (html && /<(p|h[1-6]|ul|ol|li|table|pre|blockquote|div|aside|details|hr|img|strong|b|em|i|a|code|span)\b/i.test(html)) {
    const blocks = htmlToBlocks(html);
    if (blocks.length) return { blocks, source: "html" };
  }
  const txt = (data["text/plain"] ?? "").replace(/\u2028/g, "\n");
  if (!txt.trim()) return { blocks: [], source: "empty" };
  if (LOOKS_LIKE_MARKDOWN.test(txt)) return { blocks: markdownToBlocks(txt), source: "markdown" };
  return { blocks: txt.split(/\n{2,}|\n/).map((l) => ({ type: "paragraph" as const, text: l ? [{ text: l }] : [] })), source: "markdown" };
}

/** Single line plain text pastes go inline into the current block instead of creating blocks. */
export function isInlinePaste(data: ClipboardData): boolean {
  if (data[NOTION_BLOCKS_MIME]) return false;
  const t = data["text/plain"] ?? "";
  if (t.includes("\n")) return false;
  const { blocks } = decodeClipboard(data);
  return blocks.length <= 1 && (!blocks[0] || blocks[0].type === "paragraph");
}

export function plainOf(blocks: BlockInput[]): string {
  return blocks.map((b) => plain(b.text ?? [])).join("\n");
}
