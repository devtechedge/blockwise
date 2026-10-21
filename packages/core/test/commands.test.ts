import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { backspaceAtStart, duplicate, indent, markdownShortcut, outdent, splitBlock, turnInto } from "../src/commands.js";
import { buildDoc, getBlock, toInput } from "../src/doc.js";
import { applyOps } from "../src/history.js";
import { seedIds } from "../src/ids.js";
import { text } from "../src/rich-text.js";
import type { Doc } from "../src/blocks.js";

let reset: () => void;
beforeEach(() => { reset = seedIds(); });
afterEach(() => reset());

const shape = (d: Doc) => toInput(d, d.rootId, false).children;
const kids = (d: Doc, id = d.rootId) => getBlock(d, id).children;

describe("commands", () => {
  it("Enter splits a paragraph", () => {
    const d = buildDoc("P", [{ type: "paragraph", text: text("hello") }]);
    const r = splitBlock(d, kids(d)[0]!, 2);
    const n = applyOps(d, r.ops);
    expect(shape(n)).toEqual([{ type: "paragraph", text: text("he") }, { type: "paragraph", text: text("llo") }]);
    expect(r.focus?.offset).toBe(0);
  });
  it("Enter continues lists and to-dos unchecked", () => {
    const d = buildDoc("P", [{ type: "to_do", text: text("a"), props: { checked: true } }]);
    const n = applyOps(d, splitBlock(d, kids(d)[0]!, 1).ops);
    expect(shape(n)?.[1]).toEqual({ type: "to_do", props: { checked: false } });
  });
  it("Enter on an empty top level list item turns it into text", () => {
    const d = buildDoc("P", [{ type: "bulleted_list_item" }]);
    const n = applyOps(d, splitBlock(d, kids(d)[0]!, 0).ops);
    expect(shape(n)).toEqual([{ type: "paragraph" }]);
  });
  it("Tab and Shift+Tab nest and un-nest", () => {
    const d = buildDoc("P", [{ type: "bulleted_list_item", text: text("a") }, { type: "bulleted_list_item", text: text("b") }, { type: "bulleted_list_item", text: text("c") }]);
    const [, b, c] = kids(d);
    let n = applyOps(d, indent(d, b!).ops);
    n = applyOps(n, indent(n, c!).ops);
    expect(shape(n)?.[0]?.children?.map((x) => x.text)).toEqual([text("b"), text("c")]);
    n = applyOps(n, outdent(n, b!).ops);
    expect(shape(n)).toEqual([
      { type: "bulleted_list_item", text: text("a") },
      { type: "bulleted_list_item", text: text("b"), children: [{ type: "bulleted_list_item", text: text("c") }] },
    ]);
  });
  it("Backspace at start turns a heading into text, then merges", () => {
    const d = buildDoc("P", [{ type: "paragraph", text: text("ab") }, { type: "heading_2", text: text("cd") }]);
    const h = kids(d)[1]!;
    let n = applyOps(d, backspaceAtStart(d, h).ops);
    expect(getBlock(n, h).type).toBe("paragraph");
    const r = backspaceAtStart(n, h);
    n = applyOps(n, r.ops);
    expect(shape(n)).toEqual([{ type: "paragraph", text: text("abcd") }]);
    expect(r.focus).toEqual({ id: kids(d)[0], offset: 2 });
  });
  it("markdown shortcuts change the block type", () => {
    const d = buildDoc("P", [{ type: "paragraph", text: text("## Title") }]);
    const n = applyOps(d, markdownShortcut(d, kids(d)[0]!, "## ")!.ops);
    expect(shape(n)).toEqual([{ type: "heading_2", text: text("Title") }]);
    expect(markdownShortcut(d, kids(d)[0]!, "x ")).toBeNull();
  });
  it("--- becomes a divider followed by an empty paragraph", () => {
    const d = buildDoc("P", [{ type: "paragraph", text: text("---") }]);
    const n = applyOps(d, markdownShortcut(d, kids(d)[0]!, "---")!.ops);
    expect(shape(n)).toEqual([{ type: "divider" }, { type: "paragraph" }]);
  });
  it("turn into and duplicate", () => {
    const d = buildDoc("P", [{ type: "paragraph", text: text("x"), children: [{ type: "paragraph", text: text("y") }] }]);
    let n = applyOps(d, turnInto(d, kids(d)[0]!, "callout").ops);
    expect(getBlock(n, kids(d)[0]!).props.icon).toBeDefined();
    n = applyOps(n, duplicate(n, kids(n)[0]!).ops);
    expect(shape(n)?.[0]).toEqual(shape(n)?.[1]);
  });
});
