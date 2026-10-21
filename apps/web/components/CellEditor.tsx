"use client";
import { useLayoutEffect, useRef } from "react";
import type { RichText } from "@blockwise/core";
import { domToRich, richToHtml } from "@/lib/rich-dom";

/** A small rich text cell (tables). Formatting shortcuts are left to the browser defaults. */
export function CellEditor({ value, onChange, label }: { value: RichText; onChange: (rt: RichText) => void; label: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (JSON.stringify(domToRich(el)) !== JSON.stringify(value)) el.innerHTML = richToHtml(value);
  }, [value]);
  return (
    <div ref={ref} className="cell" contentEditable suppressContentEditableWarning aria-label={label} role="textbox"
      onInput={() => onChange(domToRich(ref.current!))}
      onKeyDown={(e) => { if (e.key === "Enter") e.preventDefault(); }}
      onPaste={(e) => { e.preventDefault(); document.execCommand("insertText", false, e.clipboardData.getData("text/plain").replace(/\n/g, " ")); }} />
  );
}
