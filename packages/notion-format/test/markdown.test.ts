import { describe, expect, it } from "vitest";
import { text, type BlockInput } from "@blockwise/core";
import { blocksToMarkdown, markdownToBlocks, pageToMarkdown, parseExportPage } from "../src/markdown.js";
import { inlineToMd, mdToInline } from "../src/inline-md.js";

describe("inline markdown", () => {
  it("round trips marks", () => {
    const rt = [{ text: "a " }, { text: "bold", marks: { bold: true } }, { text: " " }, { text: "it", marks: { italic: true } }, { text: " " }, { text: "code", marks: { code: true } }, { text: " " }, { text: "gone", marks: { strike: true } }, { text: " " }, { text: "link", marks: { link: "https://x.y/a b" } }, { text: " " }, { text: "x+1", equation: "x+1" }];
    const md = inlineToMd(rt);
    expect(md).toBe("a **bold** *it* `code` ~~gone~~ [link](https://x.y/a%20b) $x+1$");
    expect(mdToInline(md)).toEqual(rt);
  });
  it("escapes special characters", () => {
    expect(mdToInline(inlineToMd(text("2 * 3 = [6] `x`")))).toEqual(text("2 * 3 = [6] `x`"));
  });
  it("keeps whitespace outside markers", () => {
    expect(inlineToMd([{ text: "a" }, { text: " b ", marks: { bold: true } }, { text: "c" }])).toBe("a **b** c");
  });
});

const sample: BlockInput[] = [
  { type: "heading_1", text: text("Heading") },
  { type: "paragraph", text: text("Some text") },
  { type: "bulleted_list_item", text: text("one"), children: [{ type: "bulleted_list_item", text: text("nested") }] },
  { type: "bulleted_list_item", text: text("two") },
  { type: "numbered_list_item", text: text("first") },
  { type: "numbered_list_item", text: text("second") },
  { type: "to_do", text: text("done"), props: { checked: true } },
  { type: "to_do", text: text("open"), props: { checked: false } },
  { type: "quote", text: text("quoted") },
  { type: "callout", text: text("careful"), props: { icon: "\u26a0\ufe0f" } },
  { type: "code", text: text("const a = 1;\nconsole.log(a);"), props: { language: "javascript" } },
  { type: "divider" },
  { type: "equation", props: { expression: "a^2+b^2=c^2" } },
  { type: "table", props: { width: 2, hasColumnHeader: true, hasRowHeader: false }, children: [
    { type: "table_row", props: { cells: [text("A"), text("B")] } },
    { type: "table_row", props: { cells: [text("1"), text("x | y")] } },
  ] },
  { type: "image", props: { url: "Page/image.png", caption: text("cap") } },
];

describe("block markdown", () => {
  it("writes Notion export style markdown", () => {
    expect(blocksToMarkdown(sample)).toMatchInlineSnapshot(`
      "# Heading

      Some text

      - one
          - nested
      - two
      1. first
      2. second
      - [x] done
      - [ ] open

      > quoted

      <aside>
      ⚠️ careful
      </aside>

      \`\`\`javascript
      const a = 1;
      console.log(a);
      \`\`\`

      ---

      $$
      a^2+b^2=c^2
      $$

      | A | B |
      | --- | --- |
      | 1 | x \\| y |

      ![cap](Page/image.png)
      "
    `);
  });
  it("parses its own output back to the same blocks", () => {
    expect(markdownToBlocks(blocksToMarkdown(sample))).toEqual(sample);
  });
  it("parses tabs, two space indents and details toggles", () => {
    expect(markdownToBlocks("- a\n\t- b\n  - c\n\n<details>\n<summary>T</summary>\n\ninside\n</details>")).toEqual([
      { type: "bulleted_list_item", text: text("a"), children: [{ type: "bulleted_list_item", text: text("b") }, { type: "bulleted_list_item", text: text("c") }] },
      { type: "toggle", text: text("T"), children: [{ type: "paragraph", text: text("inside") }] },
    ]);
  });
  it("handles export pages with property lines", () => {
    const md = pageToMarkdown("Task", [{ type: "paragraph", text: text("body") }], { Status: "Done", Tags: "a, b" });
    expect(md).toBe("# Task\n\nStatus: Done\nTags: a, b\n\nbody\n");
    expect(parseExportPage(md)).toEqual({ title: "Task", properties: { Status: "Done", Tags: "a, b" }, blocks: [{ type: "paragraph", text: text("body") }] });
  });
});
