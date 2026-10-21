"use client";
import { useEffect, useRef } from "react";
import { filterSlash, setUi, useUi, getUi } from "@/lib/ui";
import { chooseBlockType } from "@/lib/actions";
import { getSelectionOffsets } from "@/lib/caret";

export function SlashMenu() {
  const slash = useUi((u) => u.slash);
  const list = useRef<HTMLDivElement>(null);
  useEffect(() => { list.current?.querySelector(".active")?.scrollIntoView({ block: "nearest" }); }, [slash?.index]);
  if (!slash) return null;
  const items = filterSlash(slash.query);
  const pick = (i: number) => {
    const s = getUi().slash;
    if (!s) return;
    const el = document.querySelector<HTMLElement>(`[data-block-id="${s.blockId}"]`);
    const caret = (el && getSelectionOffsets(el)?.end) ?? s.start + 1 + s.query.length;
    setUi({ slash: null });
    chooseBlockType(s.blockId, items[i]!.type, s.start, caret);
  };
  return (
    <div className="slash-menu" role="listbox" aria-label="Insert block" ref={list} style={{ left: slash.x, top: slash.y }}>
      {items.length === 0 && <div className="slash-empty">No results</div>}
      {items.map((it, i) => (
        <div key={it.type} role="option" aria-selected={i === slash.index} className={`slash-item ${i === slash.index ? "active" : ""}`}
          onMouseDown={(e) => { e.preventDefault(); pick(i); }}
          onMouseEnter={() => setUi({ slash: { ...slash, index: i } })}>
          <span className="slash-icon">{it.icon}</span>
          <span className="slash-label">{it.label}</span>
          <span className="slash-hint">{it.hint}</span>
        </div>
      ))}
    </div>
  );
}
