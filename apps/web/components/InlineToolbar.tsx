"use client";
import { useEffect, useState } from "react";
import type { Color, Marks } from "@blockwise/core";
import { currentDoc } from "@/lib/store";
import { toggleMark } from "./TextBlock";

const COLORS: Color[] = ["default", "gray", "brown", "orange", "yellow", "green", "blue", "purple", "pink", "red", "yellow_background", "blue_background", "green_background", "red_background"];

interface Pos { x: number; y: number; id: string }

export function InlineToolbar() {
  const [pos, setPos] = useState<Pos | null>(null);
  const [colors, setColors] = useState(false);
  useEffect(() => {
    const onSel = () => {
      const sel = window.getSelection();
      if (!sel || sel.isCollapsed || sel.rangeCount === 0) { setPos(null); setColors(false); return; }
      const node = sel.anchorNode instanceof HTMLElement ? sel.anchorNode : sel.anchorNode?.parentElement;
      const el = node?.closest<HTMLElement>("[data-text-block]");
      if (!el || el.closest(".code") || !el.contains(sel.focusNode)) { setPos(null); return; }
      const r = sel.getRangeAt(0).getBoundingClientRect();
      setPos({ x: r.left + r.width / 2, y: r.top - 8, id: el.dataset.blockId! });
    };
    document.addEventListener("selectionchange", onSel);
    return () => document.removeEventListener("selectionchange", onSel);
  }, []);
  if (!pos) return null;
  const act = (key: keyof Marks, value?: Marks[keyof Marks]) => {
    const el = document.querySelector<HTMLElement>(`[data-block-id="${pos.id}"]`);
    const block = currentDoc()?.blocks[pos.id];
    if (el && block) toggleMark(el, block, key, value ?? true);
  };
  return (
    <div className="inline-toolbar" role="toolbar" aria-label="Text formatting" style={{ left: pos.x, top: pos.y }} onMouseDown={(e) => e.preventDefault()}>
      <button aria-label="Bold" onClick={() => act("bold")}><b>B</b></button>
      <button aria-label="Italic" onClick={() => act("italic")}><i>i</i></button>
      <button aria-label="Underline" onClick={() => act("underline")}><u>U</u></button>
      <button aria-label="Strikethrough" onClick={() => act("strike")}><s>S</s></button>
      <button aria-label="Code" onClick={() => act("code")}>{"<>"}</button>
      <button aria-label="Link" onClick={() => { const url = window.prompt("Link URL"); if (url !== null) act("link", url || undefined); }}>{"\u{1F517}"}</button>
      <button aria-label="Colour" onClick={() => setColors(!colors)}>A{"\u25BE"}</button>
      {colors && (
        <div className="colors">
          {COLORS.map((c) => <button key={c} aria-label={c.replace("_", " ")} className={`swatch c-${c}`} onClick={() => { act("color", c === "default" ? undefined : c); setColors(false); }}>A</button>)}
        </div>
      )}
    </div>
  );
}
