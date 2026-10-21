import { describe, expect, it, vi } from "vitest";
import { addPage, breadcrumbs, childPages, emptyWorkspace, movePage, newPage, pageTitle, removePage, searchPages } from "../src/workspace.js";
import { autosave, memoryStorage, indexedDbStorage } from "../src/storage.js";
import { buildDoc } from "../src/doc.js";
import { text } from "../src/rich-text.js";
import "fake-indexeddb/auto";

describe("workspace", () => {
  it("keeps a page tree", () => {
    let ws = emptyWorkspace();
    let a: string, b: string, c: string;
    [ws, a] = newPage(ws, "A");
    [ws, b] = newPage(ws, "B", a);
    [ws, c] = newPage(ws, "C", b);
    expect(breadcrumbs(ws, c)).toEqual([a, b, c]);
    expect(pageTitle(ws, b)).toBe("B");
    expect(() => movePage(ws, a, c, 0)).toThrow();
    ws = movePage(ws, c, null, 0);
    expect(childPages(ws, null)).toEqual([c, a]);
    ws = removePage(ws, a);
    expect(Object.keys(ws.pages)).toEqual([c]);
  });
  it("searches block text", () => {
    const ws = addPage(emptyWorkspace(), buildDoc("Notes", [{ type: "paragraph", text: text("find the needle") }]));
    expect(searchPages(ws, "NEEDLE")).toHaveLength(1);
    expect(searchPages(ws, "hay")).toHaveLength(0);
  });
});

describe("storage", () => {
  it("round trips through memory and IndexedDB", async () => {
    const ws = addPage(emptyWorkspace(), buildDoc("Saved", []));
    for (const s of [memoryStorage(), indexedDbStorage("test-db")]) {
      expect(await s.load()).toBeNull();
      await s.save(ws);
      expect(await s.load()).toEqual(ws);
    }
  });
  it("debounces autosave", async () => {
    vi.useFakeTimers();
    const s = memoryStorage();
    const save = vi.spyOn(s, "save");
    const a = autosave(s, 100);
    a.schedule(emptyWorkspace());
    a.schedule(emptyWorkspace());
    vi.advanceTimersByTime(150);
    await Promise.resolve();
    expect(save).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });
});
