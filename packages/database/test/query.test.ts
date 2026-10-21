import { describe, expect, it } from "vitest";
import { addProperty, addRow, createDatabase, removeProperty, updateRow, type Database } from "../src/model.js";
import { queryView } from "../src/query.js";

function sample(): Database {
  let db = createDatabase("Tasks");
  db = addProperty(db, "Points", "number");
  db = addProperty(db, "Status", "select");
  db = addProperty(db, "Tags", "multi_select");
  db = addProperty(db, "Due", "date");
  db = addProperty(db, "Done", "checkbox");
  const [, pts, st, tags, due, done] = db.properties.map((p) => p.id);
  db = addRow(db, { title: "Write spec", [pts!]: 3, [st!]: "Doing", [tags!]: ["docs"], [due!]: { start: "2026-10-20" }, [done!]: false });
  db = addRow(db, { title: "Ship", [pts!]: 8, [st!]: "Todo", [tags!]: ["release", "docs"], [due!]: { start: "2026-11-01" }, [done!]: false });
  db = addRow(db, { title: "Fix bug", [pts!]: 1, [st!]: "Done", [tags!]: [], [done!]: true });
  return db;
}

describe("database", () => {
  it("creates select options on first use", () => {
    const db = sample();
    expect(db.properties[2]!.options?.map((o) => o.name)).toEqual(["Doing", "Todo", "Done"]);
    expect(db.properties[3]!.options?.map((o) => o.name)).toEqual(["docs", "release"]);
  });
  it("filters with and/or", () => {
    const db = sample();
    const [, pts, , tags, due, done] = db.properties.map((p) => p.id);
    const titles = (rows: { values: Record<string, unknown> }[]) => rows.map((r) => r.values.title);
    expect(titles(queryView(db, { conjunction: "and", sorts: [], filters: [{ property: tags!, op: "contains", value: "docs" }, { property: pts!, op: "greater_than", value: 5 }] }))).toEqual(["Ship"]);
    expect(titles(queryView(db, { conjunction: "or", sorts: [], filters: [{ property: done!, op: "is_checked" }, { property: due!, op: "before", value: "2026-10-21" }] }))).toEqual(["Write spec", "Fix bug"]);
    expect(titles(queryView(db, { conjunction: "and", sorts: [], filters: [{ property: due!, op: "is_empty" }] }))).toEqual(["Fix bug"]);
    expect(titles(queryView(db, { conjunction: "and", sorts: [], filters: [{ property: "title", op: "contains", value: "SHIP" }] }))).toEqual(["Ship"]);
  });
  it("sorts by number, select order and dates with empties last", () => {
    const db = sample();
    const [, pts, st, , due] = db.properties.map((p) => p.id);
    const titles = (s: Parameters<typeof queryView>[1]["sorts"]) => queryView(db, { conjunction: "and", filters: [], sorts: s }).map((r) => r.values.title);
    expect(titles([{ property: pts!, direction: "descending" }])).toEqual(["Ship", "Write spec", "Fix bug"]);
    expect(titles([{ property: st!, direction: "ascending" }])).toEqual(["Write spec", "Ship", "Fix bug"]);
    expect(titles([{ property: due!, direction: "descending" }])).toEqual(["Ship", "Write spec", "Fix bug"]);
  });
  it("removing a property cleans rows and views", () => {
    let db = sample();
    const pts = db.properties[1]!.id;
    db = updateRow(db, db.rows[0]!.id, pts, 5);
    db = { ...db, views: [{ ...db.views[0]!, sorts: [{ property: pts, direction: "ascending" }] }] };
    db = removeProperty(db, pts);
    expect(db.rows[0]!.values[pts]).toBeUndefined();
    expect(db.views[0]!.sorts).toEqual([]);
  });
});
