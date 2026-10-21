// Regenerates the canonical clipboard fixtures. Run: npx tsx scripts/make-clipboard-fixtures.ts
import { writeFileSync } from "node:fs";
const out = new URL("../fixtures/clipboard/", import.meta.url);
import { seedIds, text } from "@blockwise/core";
import { encodeInputs } from "../src/clipboard.js";
const reset = seedIds(0x100);
const sets = {
  "paragraph-marks": [{ type: "paragraph", text: [{ text: "Plain, " }, { text: "bold", marks: { bold: true } }, { text: ", " }, { text: "italic link", marks: { italic: true, link: "https://example.com" } }, { text: " and " }, { text: "E=mc^2", equation: "E=mc^2" }] }],
  "nested-lists": [
    { type: "bulleted_list_item", text: text("Fruit"), children: [{ type: "bulleted_list_item", text: text("Apple") }, { type: "bulleted_list_item", text: text("Pear"), children: [{ type: "numbered_list_item", text: text("ripe") }] }] },
    { type: "to_do", text: text("Buy milk"), props: { checked: true } },
    { type: "to_do", text: text("Call back"), props: { checked: false } },
  ],
  "rich-blocks": [
    { type: "heading_1", text: text("Release notes") },
    { type: "callout", text: text("Read this first"), props: { icon: "\u{1F4A1}", color: "gray_background" } },
    { type: "toggle", text: text("Details"), children: [{ type: "quote", text: text("Quoted inside a toggle") }] },
    { type: "code", text: text("pnpm install\npnpm test"), props: { language: "bash" } },
    { type: "divider" },
    { type: "equation", props: { expression: "\\int_0^1 x\\,dx" } },
  ],
  "table-columns": [
    { type: "table", props: { width: 3, hasColumnHeader: true, hasRowHeader: false }, children: [
      { type: "table_row", props: { cells: [text("Name"), text("Role"), text("Since")] } },
      { type: "table_row", props: { cells: [text("Ada"), text("Engineer", { bold: true }), text("1843")] } },
    ] },
    { type: "column_list", children: [
      { type: "column", props: { ratio: 0.5 }, children: [{ type: "heading_3", text: text("Left") }] },
      { type: "column", props: { ratio: 0.5 }, children: [{ type: "image", props: { url: "https://example.com/diagram.png", caption: text("Diagram") } }] },
    ] },
  ],
};
for (const [name, inputs] of Object.entries(sets)) {
  const data = encodeInputs(inputs as never, { now: 1792540800000, spaceId: "00000000-0000-4000-8000-0000000000aa" });
  const json = JSON.parse(data["text/_notion-blocks-v3-production"]!);
  writeFileSync(new URL(`${name}.json`, out), JSON.stringify({ mime: { "text/plain": data["text/plain"], "text/html": data["text/html"], "text/_notion-blocks-v3-production": data["text/_notion-blocks-v3-production"] }, payload: json }, null, 2) + "\n");
}
reset();
