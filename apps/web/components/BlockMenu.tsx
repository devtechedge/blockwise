"use client";
import { useEffect } from "react";
import type { BlockType, Color } from "@blockwise/core";
import { getUi, setUi, useUi, SLASH_ITEMS } from "@/lib/ui";
import { colorSelection, deleteSelection, duplicateSelection, turnSelectionInto } from "@/lib/actions";

const NAMES = ["default", "gray", "brown", "orange", "yellow", "green", "blue", "purple", "pink", "red"] as const;
const label = (n: string) => n[0]!.toUpperCase() + n.slice(1);
const TURN: BlockType[] = ["paragraph", "heading_1", "heading_2", "heading_3", "to_do", "bulleted_list_item", "numbered_list_item", "toggle", "quote", "callout", "code"];

export function openBlockMenu(id: string, el: HTMLElement): void {
  const r = el.getBoundingClientRect();
  setUi({ blockMenu: { id, x: Math.max(8, r.left - 4), y: r.bottom + 4, sub: null } });
}

const close = () => setUi({ blockMenu: null });

export function BlockMenu() {
  const m = useUi((u) => u.blockMenu);
  useEffect(() => {
    if (!m) return;
    const down = (e: MouseEvent) => { if (!(e.target as HTMLElement).closest(".block-menu, .handle")) close(); };
    const key = (e: KeyboardEvent) => { if (e.key === "Escape" && getUi().blockMenu) { e.stopPropagation(); close(); } };
    document.addEventListener("mousedown", down);
    document.addEventListener("keydown", key, true);
    return () => { document.removeEventListener("mousedown", down); document.removeEventListener("keydown", key, true); };
  }, [m]);
  if (!m) return null;
  const sub = (s: "turn" | "color") => setUi({ blockMenu: { ...m, sub: m.sub === s ? null : s } });
  const pickColor = (c: Color | "default") => { colorSelection(c); close(); };
  return (
    <div className="block-menu" role="menu" aria-label="Block menu" style={{ left: m.x, top: m.y }}>
      <button role="menuitem" onClick={() => { deleteSelection(); close(); }}>Delete</button>
      <button role="menuitem" onClick={() => { duplicateSelection(); close(); }}>Duplicate</button>
      <button role="menuitem" aria-haspopup="menu" aria-expanded={m.sub === "turn"} onClick={() => sub("turn")}>Turn into <span className="chev">{"\u203A"}</span></button>
      <button role="menuitem" aria-haspopup="menu" aria-expanded={m.sub === "color"} onClick={() => sub("color")}>Color <span className="chev">{"\u203A"}</span></button>
      {m.sub === "turn" && (
        <div className="block-sub" role="menu" aria-label="Turn into">
          {TURN.map((t) => { const it = SLASH_ITEMS.find((i) => i.type === t)!; return (
            <button key={t} role="menuitem" onClick={() => { turnSelectionInto(t); close(); }}><span className="slash-icon">{it.icon}</span>{it.label}</button>
          ); })}
        </div>
      )}
      {m.sub === "color" && (
        <div className="block-sub" role="menu" aria-label="Color">
          <div className="sub-head">Text color</div>
          {NAMES.map((n) => (
            <button key={n} role="menuitem" aria-label={`${label(n)} text`} onClick={() => pickColor(n)}><span className={`swatch-box c-${n}`}>A</span>{label(n)}</button>
          ))}
          <div className="sub-head">Background color</div>
          {NAMES.map((n) => { const c = n === "default" ? "default" : (`${n}_background` as Color); return (
            <button key={n} role="menuitem" aria-label={`${label(n)} background`} onClick={() => pickColor(c)}><span className={`swatch-box c-${c}`}>A</span>{label(n)} background</button>
          ); })}
        </div>
      )}
    </div>
  );
}
