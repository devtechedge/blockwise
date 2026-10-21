import { describe, expect, it } from "vitest";
import { text, type BlockInput } from "@blockwise/core";
import { blocksToHtml, htmlToBlocks, inlineToHtml, htmlInline, pageToHtml, parseExportHtml } from "../src/html.js";
import { parse } from "node-html-parser";

const sample: BlockInput[] = [
  { type: "heading_1", text: text("Heading") },
  { type: "paragraph", text: [{ text: "Mixed " }, { text: "bold", marks: { bold: true } }, { text: " and " }, { text: "red", marks: { color: "red" } }], children: [{ type: "paragraph", text: text("indented child") }] },
  { type: "bulleted_list_item", text: text("one"), children: [{ type: "bulleted_list_item", text: text("nested") }] },
  { type: "numbered_list_item", text: text("first") },
  { type: "numbered_list_item", text: text("second") },
  { type: "to_do", text: text("done"), props: { checked: true } },
  { type: "to_do", text: text("open"), props: { checked: false }, children: [{ type: "paragraph", text: text("sub") }] },
  { type: "toggle", text: text("Toggle"), children: [{ type: "paragraph", text: text("hidden") }] },
  { type: "quote", text: text("quoted") },
  { type: "callout", text: text("careful"), props: { icon: "!" } },
  { type: "code", text: text("if (a < b) {\n  go();\n}"), props: { language: "javascript" } },
  { type: "divider" },
  { type: "equation", props: { expression: "a<b" } },
  { type: "table", props: { width: 2, hasColumnHeader: true, hasRowHeader: false }, children: [
    { type: "table_row", props: { cells: [text("A"), text("B")] } },
    { type: "table_row", props: { cells: [text("1"), text("2", { italic: true })] } },
  ] },
  { type: "image", props: { url: "https://example.com/a.png", caption: text("cap") } },
  { type: "column_list", children: [
    { type: "column", props: { ratio: 0.5 }, children: [{ type: "paragraph", text: text("left") }] },
    { type: "column", props: { ratio: 0.5 }, children: [{ type: "paragraph", text: text("right") }] },
  ] },
];

describe("html", () => {
  it("renders inline marks with export elements", () => {
    expect(inlineToHtml([{ text: "a", marks: { bold: true, underline: true, link: "https://x.y" } }, { text: "<b>" }])).toBe('<a href="https://x.y"><strong><span style="border-bottom:0.05em solid">a</span></strong></a>&lt;b&gt;');
  });
  it("parses inline marks from common HTML", () => {
    const rt = htmlInline(parse('<b>b</b> <i>i</i> <s>s</s> <u>u</u> <span style="font-weight: 700">w</span> <code>c</code> <mark class="highlight-blue">h</mark>').childNodes);
    expect(rt).toEqual([
      { text: "b", marks: { bold: true } }, { text: " " }, { text: "i", marks: { italic: true } }, { text: " " },
      { text: "s", marks: { strike: true } }, { text: " " }, { text: "u", marks: { underline: true } }, { text: " " },
      { text: "w", marks: { bold: true } }, { text: " " }, { text: "c", marks: { code: true } }, { text: " " }, { text: "h", marks: { color: "blue" } },
    ]);
  });
  it("round trips every block through export HTML", () => {
    expect(htmlToBlocks(blocksToHtml(sample))).toEqual(sample);
  });
  it("parses an export page with title and icon", () => {
    const page = pageToHtml("My page", sample.slice(0, 2), { icon: "\u{1F4D8}", id: "abc" });
    expect(parseExportHtml(page)).toEqual({ title: "My page", icon: "\u{1F4D8}", blocks: sample.slice(0, 2) });
  });
  it("accepts generic HTML from other apps", () => {
    const html = '<meta charset="utf-8"><h2>Plan</h2><ul><li>a<ul><li>b</li></ul></li><li><input type="checkbox" checked> c</li></ul><p>x<br>y</p><blockquote><p>q</p></blockquote>';
    expect(htmlToBlocks(html)).toEqual([
      { type: "heading_2", text: text("Plan") },
      { type: "bulleted_list_item", text: text("a"), children: [{ type: "bulleted_list_item", text: text("b") }] },
      { type: "to_do", text: text("c"), props: { checked: true } },
      { type: "paragraph", text: text("x\ny") },
      { type: "quote", text: text("q") },
    ]);
  });
});

describe("block colors in HTML export", () => {
  it("writes block-color classes that import back", () => {
    const blocks = [{ type: "paragraph" as const, text: [{ text: "p" }], props: { color: "orange_background" as const } }, { type: "quote" as const, text: [{ text: "q" }], props: { color: "purple" as const } }];
    const html = pageToHtml("T", blocks);
    expect(html).toContain('<p class="block-color-orange_background">p</p>');
    expect(html).not.toContain("data-notion-highlight");
    const back = htmlToBlocks(html);
    expect(back.map((b) => b.props?.color)).toEqual(["orange_background", "purple"]);
  });
});
