import { describe, expect, it } from "vitest";
import { fromTitle, toTitle } from "../src/title.js";
import type { RichText } from "@blockwise/core";

describe("title arrays", () => {
  const rt: RichText = [
    { text: "plain " },
    { text: "bold", marks: { bold: true, italic: true } },
    { text: " link", marks: { link: "https://example.com" } },
    { text: "x^2", equation: "x^2" },
    { text: "\u2023", mention: { kind: "page", id: "p1" } },
    { text: "\u2023", mention: { kind: "date", start: "2026-10-21" } },
    { text: "red", marks: { color: "red_background", underline: true, strike: true, code: true } },
  ];
  it("writes Notion annotation codes", () => {
    expect(toTitle(rt)).toEqual([
      ["plain "],
      ["bold", [["b"], ["i"]]],
      [" link", [["a", "https://example.com"]]],
      ["\u204d", [["e", "x^2"]]],
      ["\u2023", [["p", "p1"]]],
      ["\u2023", [["d", { type: "date", start_date: "2026-10-21" }]]],
      ["red", [["s"], ["_"], ["c"], ["h", "red_background"]]],
    ]);
  });
  it("round trips", () => {
    expect(fromTitle(toTitle(rt))).toEqual(rt);
  });
  it("ignores unknown annotations and junk", () => {
    expect(fromTitle([["a", [["m", "discussion-id"]]], 5, ["b"]])).toEqual([{ text: "ab" }]);
    expect(fromTitle(null)).toEqual([]);
  });
});
