import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildDoc, getBlock, text } from "@blockwise/core";
import { decodeClipboard, encodeClipboard, encodeInputs, isInlinePaste, NOTION_BLOCKS_MIME, type ClipboardData } from "../src/clipboard.js";

const dir = new URL("../fixtures/clipboard/", import.meta.url);
const load = (f: string) => JSON.parse(readFileSync(new URL(f, dir), "utf8")) as { mime: ClipboardData; payload?: unknown };
const canonical = readdirSync(dir).filter((f) => f.endsWith(".json") && !f.startsWith("notion-shaped"));

describe("clipboard fixtures", () => {
  it.each(canonical)("%s re-encodes byte for byte", (f) => {
    const { mime } = load(f);
    const payload = JSON.parse(mime[NOTION_BLOCKS_MIME]!);
    const first = payload.blocks[0].blockSubtree.block[payload.blocks[0].blockId];
    const { blocks, source } = decodeClipboard(mime, { keepIds: true });
    expect(source).toBe("notion-blocks");
    const doc = buildDoc("", blocks, first.value.value.parent_id);
    const again = encodeClipboard(doc, getBlock(doc, doc.rootId).children, { freshIds: false, now: first.value.value.created_time, spaceId: first.spaceId });
    expect(again[NOTION_BLOCKS_MIME]).toBe(mime[NOTION_BLOCKS_MIME]);
    expect(again["text/html"]).toBe(mime["text/html"]);
    expect(again["text/plain"]).toBe(mime["text/plain"]);
  });

  it.each(canonical)("%s decodes to the same blocks from every representation", (f) => {
    const { mime } = load(f);
    const fromBlocks = decodeClipboard(mime).blocks;
    const fromHtml = decodeClipboard({ "text/html": mime["text/html"]! });
    expect(fromHtml.source).toBe("html");
    expect(fromHtml.blocks).toEqual(fromBlocks);
  });

  it("reads Notion shaped payloads with extra record fields and the notionvc marker", () => {
    const { mime } = load("notion-shaped-extra-fields.json");
    const expected = [{ type: "heading_2", text: text("Shopping") }, { type: "to_do", text: text("Eggs"), props: { checked: false } }];
    expect(decodeClipboard(mime).blocks).toEqual(expected);
    expect(decodeClipboard({ "text/html": mime["text/html"]! }).blocks).toEqual(expected);
    expect(decodeClipboard({ "text/plain": mime["text/plain"]! }).blocks).toEqual([{ type: "paragraph", text: text("Shopping") }, expected[1]]);
  });
});

describe("clipboard behaviour", () => {
  it("falls back to HTML when the private payload is broken", () => {
    const r = decodeClipboard({ [NOTION_BLOCKS_MIME]: "{not json", "text/html": "<p><strong>x</strong></p>", "text/plain": "x" });
    expect(r).toEqual({ source: "html", blocks: [{ type: "paragraph", text: text("x", { bold: true }) }] });
  });
  it("treats plain text without Markdown as paragraphs", () => {
    expect(decodeClipboard({ "text/plain": "a\nb" }).blocks).toEqual([{ type: "paragraph", text: text("a") }, { type: "paragraph", text: text("b") }]);
    expect(decodeClipboard({}).source).toBe("empty");
  });
  it("converts U+2028 line separators like Notion", () => {
    expect(decodeClipboard({ "text/plain": "- a\u2028- b" }).blocks).toHaveLength(2);
  });
  it("detects inline pastes", () => {
    expect(isInlinePaste({ "text/plain": "word" })).toBe(true);
    expect(isInlinePaste({ "text/plain": "a\nb" })).toBe(false);
    expect(isInlinePaste(encodeInputs([{ type: "paragraph", text: text("x") }]))).toBe(false);
  });
  it("uses fresh ids on every copy so pastes never collide", () => {
    const d = buildDoc("", [{ type: "paragraph", text: text("x") }]);
    const ids = getBlock(d, d.rootId).children;
    const a = JSON.parse(encodeClipboard(d, ids)[NOTION_BLOCKS_MIME]!);
    const b = JSON.parse(encodeClipboard(d, ids)[NOTION_BLOCKS_MIME]!);
    expect(a.blocks[0].blockId).not.toBe(b.blocks[0].blockId);
    expect(a.blocks[0].blockId).not.toBe(ids[0]);
  });
  it("marks non contiguous selections", () => {
    const d = buildDoc("", [{ type: "paragraph", text: text("a") }, { type: "paragraph", text: text("b") }, { type: "paragraph", text: text("c") }]);
    const [a, , c] = getBlock(d, d.rootId).children;
    expect(JSON.parse(encodeClipboard(d, [a!, c!])[NOTION_BLOCKS_MIME]!).wasContiguousSelection).toBe(false);
  });
});
