import { describe, expect, it } from "vitest";
import { formatNotionDate, fromNotionCsv, inferType, parseNotionDate, toNotionCsv } from "../src/notion-csv.js";

const exported = "\uFEFFName,Status,Tags,Points,Due,Done,Link\n" +
  "Write spec,Doing,\"docs, writing\",3,\"October 20, 2026\",No,https://example.com/a\n" +
  "Ship,Todo,release,8,\"November 1, 2026 \u2192 November 3, 2026\",No,\n" +
  "Fix bug,Done,,1,,Yes,https://example.com/b\n" +
  "Plan,Todo,docs,2,\"October 22, 2026 3:30 PM\",No,\n";

describe("Notion CSV", () => {
  it("formats and parses Notion dates", () => {
    expect(formatNotionDate("2026-10-21")).toBe("October 21, 2026");
    expect(formatNotionDate("2026-10-21T15:30")).toBe("October 21, 2026 3:30 PM");
    expect(parseNotionDate("October 21, 2026 12:05 AM")).toBe("2026-10-21T00:05");
    expect(parseNotionDate("nope")).toBeNull();
  });
  it("infers column types from an export", () => {
    const db = fromNotionCsv("Tasks", exported);
    expect(db.properties.map((p) => [p.name, p.type])).toEqual([
      ["Name", "title"], ["Status", "select"], ["Tags", "multi_select"], ["Points", "number"], ["Due", "date"], ["Done", "checkbox"], ["Link", "url"],
    ]);
    expect(db.rows[1]!.values.p4).toEqual({ start: "2026-11-01", end: "2026-11-03" });
    expect(db.rows[0]!.values.p2).toEqual(["docs", "writing"]);
  });
  it("round trips byte for byte", () => {
    expect(toNotionCsv(fromNotionCsv("Tasks", exported))).toBe(exported);
  });
  it("keeps free text as text", () => {
    expect(inferType(["a long note", "another", "third thing"], "Notes")).toBe("text");
  });
});
