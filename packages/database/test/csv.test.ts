import { describe, expect, it } from "vitest";
import { parseCsv, writeCsv } from "../src/csv.js";

describe("csv", () => {
  it("parses quotes, escaped quotes, newlines, BOM and CRLF", () => {
    expect(parseCsv('\uFEFFa,b\r\n"x, y","he said ""hi"""\r\n"multi\nline",\r\n')).toEqual([["a", "b"], ["x, y", 'he said "hi"'], ["multi\nline", ""]]);
  });
  it("round trips", () => {
    const rows = [["Name", "Notes"], ["a", "has, comma"], ["b", 'q"uote'], ["c", " padded "], ["d", "line\nbreak"]];
    expect(parseCsv(writeCsv(rows))).toEqual(rows);
    expect(writeCsv([["a"]])).toBe("\uFEFFa\n");
  });
});
