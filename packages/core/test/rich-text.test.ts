import { describe, expect, it } from "vitest";
import { applyMark, concat, deleteRange, hasMark, insertText, normalize, plain, slice, splitAt, text } from "../src/rich-text.js";

describe("rich text", () => {
  it("normalizes by merging equal neighbours and dropping defaults", () => {
    expect(normalize([{ text: "a" }, { text: "b", marks: { bold: false, color: "default" } }, { text: "" }])).toEqual([{ text: "ab" }]);
  });
  it("splits inside a span", () => {
    const [a, b] = splitAt(text("hello", { bold: true }), 2);
    expect(a).toEqual([{ text: "he", marks: { bold: true } }]);
    expect(b).toEqual([{ text: "llo", marks: { bold: true } }]);
  });
  it("keeps mentions atomic when splitting", () => {
    const rt = [{ text: "\u2023", mention: { kind: "page" as const, id: "p" } }];
    expect(splitAt(rt, 0)[1]).toEqual(rt);
    expect(splitAt(rt, 1)[0]).toEqual(rt);
  });
  it("applies and detects marks over a range", () => {
    const rt = applyMark(text("hello world"), 0, 5, "bold", true);
    expect(rt).toEqual([{ text: "hello", marks: { bold: true } }, { text: " world" }]);
    expect(hasMark(rt, 0, 5, "bold")).toBe(true);
    expect(hasMark(rt, 0, 6, "bold")).toBe(false);
    expect(applyMark(rt, 0, 5, "bold", false)).toEqual(text("hello world"));
  });
  it("inserts text inheriting marks but not links", () => {
    const rt = text("ab", { italic: true, link: "https://x.y" });
    expect(insertText(rt, 2, "c")).toEqual([{ text: "ab", marks: { italic: true, link: "https://x.y" } }, { text: "c", marks: { italic: true } }]);
  });
  it("deletes and slices ranges", () => {
    const rt = concat(text("ab"), text("cd", { code: true }));
    expect(plain(deleteRange(rt, 1, 3))).toBe("ad");
    expect(slice(rt, 1, 3)).toEqual([{ text: "b" }, { text: "c", marks: { code: true } }]);
  });
});
