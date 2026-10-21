import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { applyOp, buildDoc, flatten, getBlock, invertOp, listNumber, opInsert, opMove, opRemove, opUpdate, toInput } from "../src/doc.js";
import { seedIds } from "../src/ids.js";
import { text } from "../src/rich-text.js";

let reset: () => void;
beforeEach(() => { reset = seedIds(); });
afterEach(() => reset());

const sample = () => buildDoc("Page", [
  { type: "heading_1", text: text("Title") },
  { type: "bulleted_list_item", text: text("a"), children: [{ type: "bulleted_list_item", text: text("a.1") }] },
  { type: "numbered_list_item", text: text("one") },
  { type: "numbered_list_item", text: text("two") },
]);

describe("doc", () => {
  it("builds nested blocks with parent pointers", () => {
    const d = sample();
    const ids = flatten(d);
    expect(ids).toHaveLength(5);
    const child = getBlock(d, ids[2]!);
    expect(child.parent).toBe(ids[1]);
    expect(toInput(d, d.rootId, false).children?.[1]?.children?.[0]?.text).toEqual(text("a.1"));
  });
  it("numbers consecutive numbered items", () => {
    const d = sample();
    const ids = getBlock(d, d.rootId).children;
    expect(listNumber(d, ids[3]!)).toBe(2);
  });
  it("every op is inverted exactly", () => {
    const d = sample();
    const root = getBlock(d, d.rootId);
    const ops = [
      opInsert(d, d.rootId, 1, { type: "quote", text: text("q"), children: [{ type: "paragraph", text: text("p") }] }),
      opRemove(d, root.children[1]!),
      opUpdate(d, root.children[0]!, { type: "heading_2", text: text("T2") }),
      opMove(d, root.children[3]!, d.rootId, 0),
      opMove(d, root.children[0]!, root.children[1]!, 1),
    ];
    for (const op of ops) {
      const after = applyOp(d, op);
      expect(after).not.toEqual(d);
      expect(applyOp(after, invertOp(op))).toEqual(d);
    }
  });
  it("refuses to move a block into its own subtree", () => {
    const d = sample();
    const [, list] = getBlock(d, d.rootId).children;
    const child = getBlock(d, list!).children[0]!;
    expect(() => opMove(d, list!, child, 0)).toThrow();
  });
  it("moves down within the same parent to the requested slot", () => {
    const d = sample();
    const kids = getBlock(d, d.rootId).children;
    const moved = applyOp(d, opMove(d, kids[0]!, d.rootId, 3));
    expect(getBlock(moved, moved.rootId).children).toEqual([kids[1], kids[2], kids[0], kids[3]]);
  });
});
