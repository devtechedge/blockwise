import { describe, expect, it } from "vitest";
import { filterSlash, SLASH_ITEMS } from "./ui";
import { richToHtml } from "./rich-dom";

describe("slash filter", () => {
  it("returns everything for an empty query", () => expect(filterSlash("")).toHaveLength(SLASH_ITEMS.length));
  it("matches labels and keywords", () => {
    expect(filterSlash("h2")[0]!.type).toBe("heading_2");
    expect(filterSlash("latex").map((i) => i.type)).toEqual(["equation"]);
  });
});

describe("rich text to html", () => {
  it("escapes text and wraps marks", () => {
    const html = richToHtml([{ text: "<a>", marks: { bold: true } }]);
    expect(html).toContain("&lt;a&gt;");
    expect(html).toMatch(/<(b|strong)/);
  });
});
