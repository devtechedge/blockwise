import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildDoc, getBlock, seedIds, text, toInput } from "@blockwise/core";
import { recordMapToInputs, subtreeToRecordMap } from "../src/record-map.js";

let reset: () => void;
beforeEach(() => { reset = seedIds(); });
afterEach(() => reset());

describe("record map v3", () => {
  const doc = () => buildDoc("P", [
    { type: "heading_2", text: text("H") },
    { type: "to_do", text: text("t"), props: { checked: true }, children: [{ type: "paragraph", text: text("child") }] },
    { type: "code", text: text("let a = 1"), props: { language: "typescript" } },
    { type: "callout", text: text("note"), props: { icon: "!", color: "blue_background" } },
    { type: "table", props: { width: 2, hasColumnHeader: true, hasRowHeader: false }, children: [
      { type: "table_row", props: { cells: [text("A"), text("B")] } },
      { type: "table_row", props: { cells: [text("1"), text("2", { bold: true })] } },
    ] },
    { type: "equation", props: { expression: "e=mc^2" } },
    { type: "image", props: { url: "https://example.com/a.png", caption: text("cap") } },
    { type: "column_list", children: [{ type: "column", props: { ratio: 0.5 }, children: [{ type: "paragraph", text: text("left") }] }, { type: "column", props: { ratio: 0.5 }, children: [{ type: "divider" }] }] },
  ]);

  it("uses Notion type names and version 3 nesting", () => {
    const d = doc();
    const id = getBlock(d, d.rootId).children[1]!;
    const { recordMap, rootId } = subtreeToRecordMap(d, id, "parent", { now: 1 });
    expect(recordMap.__version__).toBe(3);
    const rec = recordMap.block[rootId]!.value.value;
    expect(rec.type).toBe("to_do");
    expect(rec.properties?.checked).toEqual([["Yes"]]);
    expect(rec.content).toHaveLength(1);
    expect(recordMap.block[rec.content![0]!]!.value.value.parent_id).toBe(rootId);
  });

  it("round trips every supported block type", () => {
    const d = doc();
    for (const id of getBlock(d, d.rootId).children) {
      const { recordMap, rootId } = subtreeToRecordMap(d, id, "parent", { now: 1 });
      const [back] = recordMapToInputs(recordMap, [rootId]);
      expect(back).toEqual(toInput(d, id, false));
    }
  });

  it("reads older maps without the extra value level and skips dead blocks", () => {
    const rm = { block: {
      a: { value: { id: "a", type: "text", properties: { title: [["x"]] }, content: ["b", "c"] } },
      b: { value: { id: "b", type: "text", alive: false } },
      c: { value: { id: "c", type: "mystery_block", properties: { title: [["kept"]] } } },
    } };
    expect(recordMapToInputs(rm, ["a"])).toEqual([{ type: "paragraph", text: text("x"), children: [{ type: "paragraph", text: text("kept") }] }]);
  });
});
