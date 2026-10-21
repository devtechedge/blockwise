import { describe, expect, it } from "vitest";
import { buildDoc, getBlock, opUpdate, opInsert } from "../src/doc.js";
import { commit, commitSteps, initState, redo, undo } from "../src/history.js";
import { plain, text } from "../src/rich-text.js";

describe("history", () => {
  it("undoes and redoes transactions", () => {
    const d = buildDoc("P", [{ type: "paragraph", text: text("a") }]);
    const id = getBlock(d, d.rootId).children[0]!;
    let s = initState(d);
    s = commit(s, [opUpdate(s.doc, id, { text: text("ab") })]);
    s = commit(s, [opInsert(s.doc, d.rootId, 1, { type: "divider" })]);
    expect(getBlock(s.doc, d.rootId).children).toHaveLength(2);
    s = undo(s);
    expect(getBlock(s.doc, d.rootId).children).toHaveLength(1);
    s = undo(s);
    expect(s.doc).toEqual(d);
    s = redo(redo(s));
    expect(plain(getBlock(s.doc, id).text)).toBe("ab");
    expect(s.redo).toHaveLength(0);
  });
  it("merges tagged typing into one undo step inside the window", () => {
    const d = buildDoc("P", [{ type: "paragraph" }]);
    const id = getBlock(d, d.rootId).children[0]!;
    let s = initState(d);
    s = commit(s, [opUpdate(s.doc, id, { text: text("h") })], "type:" + id, 1000);
    s = commit(s, [opUpdate(s.doc, id, { text: text("hi") })], "type:" + id, 1500);
    s = commit(s, [opUpdate(s.doc, id, { text: text("hi!") })], "type:" + id, 5000);
    expect(s.undo).toHaveLength(2);
    expect(plain(getBlock(undo(s).doc, id).text)).toBe("hi");
    expect(undo(undo(s)).doc).toEqual(d);
  });
  it("composes steps against the latest doc", () => {
    const d = buildDoc("P", []);
    let s = initState(d);
    s = commitSteps(s, [(doc) => opInsert(doc, doc.rootId, 0, { type: "paragraph", text: text("1") }), (doc) => opInsert(doc, doc.rootId, 1, { type: "paragraph", text: text("2") })]);
    expect(getBlock(s.doc, d.rootId).children.map((c) => plain(getBlock(s.doc, c).text))).toEqual(["1", "2"]);
    expect(undo(s).doc).toEqual(d);
  });
});
