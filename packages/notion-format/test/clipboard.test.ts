import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildDoc, getBlock, text } from "@blockwise/core";
import { BLOCKWISE_BLOCKS_MIME, decodeClipboard, encodeClipboard, encodeInputs, isInlinePaste, NOTION_BLOCKS_MIME, type ClipboardData } from "../src/clipboard.js";

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
    const again = encodeClipboard(doc, getBlock(doc, doc.rootId).children, { notionPayload: true, freshIds: false, now: first.value.value.created_time, spaceId: first.spaceId });
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
    const a = JSON.parse(encodeClipboard(d, ids)[BLOCKWISE_BLOCKS_MIME]!);
    const b = JSON.parse(encodeClipboard(d, ids)[BLOCKWISE_BLOCKS_MIME]!);
    expect(a.blocks[0].blockId).not.toBe(b.blocks[0].blockId);
    expect(a.blocks[0].blockId).not.toBe(ids[0]);
  });
  it("marks non contiguous selections", () => {
    const d = buildDoc("", [{ type: "paragraph", text: text("a") }, { type: "paragraph", text: text("b") }, { type: "paragraph", text: text("c") }]);
    const [a, , c] = getBlock(d, d.rootId).children;
    expect(JSON.parse(encodeClipboard(d, [a!, c!])[BLOCKWISE_BLOCKS_MIME]!).wasContiguousSelection).toBe(false);
  });
});

describe("live paste check regressions (2026-10-22)", () => {
  const toggle = { type: "toggle" as const, text: text("Toggle"), children: [{ type: "paragraph" as const, text: text("Hidden until opened.") }] };
  const highlighted = { type: "paragraph" as const, text: [{ text: "plain " }, { text: "colour", marks: { color: "yellow_background" as const } }] };

  it("writes toggles as bare details in the HTML flavour, not inside a list", () => {
    const html = encodeInputs([toggle])["text/html"]!;
    expect(html).toMatch(/^<details[^>]*><summary>Toggle<\/summary><p>Hidden until opened\.<\/p><\/details>$/);
    expect(html).not.toContain("<ul");
  });

  it("carries highlights as inline background color in the HTML flavour", () => {
    const html = encodeInputs([highlighted])["text/html"]!;
    expect(html).toContain('style="background-color:#fbf3db"');
  });

  it("does not put an empty leading block in any flavour", () => {
    const data = encodeInputs([{ type: "heading_2", text: text("Every block type") }, toggle]);
    expect(data["text/html"]!.startsWith("<h2>")).toBe(true);
    expect(data["text/plain"]!.startsWith("## ")).toBe(true);
    const payload = JSON.parse(data[BLOCKWISE_BLOCKS_MIME]!);
    expect(payload.blocks).toHaveLength(2);
  });

  it("keeps Notion's private MIME off by default and on when asked", () => {
    expect(encodeInputs([toggle])[NOTION_BLOCKS_MIME]).toBeUndefined();
    expect(encodeInputs([toggle], { notionPayload: true })[NOTION_BLOCKS_MIME]).toBeDefined();
  });

  it("uses the traced toggle type and h annotation in the block payload", () => {
    const p = JSON.parse(encodeInputs([toggle, highlighted])[BLOCKWISE_BLOCKS_MIME]!);
    const recs = p.blocks.map((b: { blockId: string; blockSubtree: { block: Record<string, { value: { value: { type: string; properties?: { title?: unknown } } } }> } }) => b.blockSubtree.block[b.blockId]!.value.value);
    expect(recs[0].type).toBe("toggle");
    expect(JSON.stringify(recs[1].properties.title)).toContain('["h","yellow_background"]');
  });

  it("round trips toggle children and highlights through every flavour", () => {
    const data = encodeInputs([toggle, highlighted]);
    for (const only of [BLOCKWISE_BLOCKS_MIME, "text/html"]) {
      expect(decodeClipboard({ [only]: data[only]! }).blocks).toEqual([toggle, highlighted]);
    }
  });

  it("reads a Notion block payload toggle with its children", () => {
    const data = encodeInputs([toggle], { notionPayload: true });
    const r = decodeClipboard({ [NOTION_BLOCKS_MIME]: data[NOTION_BLOCKS_MIME]! });
    expect(r.source).toBe("notion-blocks");
    expect(r.blocks).toEqual([toggle]);
  });

  it("reads inline style colors from other apps", () => {
    const r = decodeClipboard({ "text/html": '<p><span style="background-color: rgb(251, 243, 219)">a</span> <span style="color:#d44c47">b</span> <mark>c</mark></p>' });
    const marks = r.blocks[0]!.text!.filter((s) => s.text.trim()).map((s) => s.marks?.color);
    expect(marks).toEqual(["yellow_background", "red", "yellow_background"]);
  });
});
