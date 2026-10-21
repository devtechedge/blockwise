"use client";
import { useEffect, useLayoutEffect, useRef } from "react";
import { applyMark, deleteRange, hasMark, insertText, length, plain, type Block, type Marks, type RichText } from "@blockwise/core";
import { caretOnEdgeLine, getSelectionOffsets, setSelectionOffsets } from "@/lib/caret";
import { domToRich, richToHtml } from "@/lib/rich-dom";
import { getState, redo, setSelection, undo, useApp } from "@/lib/store";
import { backspace, enter, focusSibling, isInlinePaste, pasteBlocks, readClipboard, setText, shortcut, tab, chooseBlockType } from "@/lib/actions";
import { filterSlash, getUi, setUi } from "@/lib/ui";

const isMac = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);

export function toggleMark(el: HTMLElement, block: Block, key: keyof Marks, value: Marks[keyof Marks] = true): void {
  const sel = getSelectionOffsets(el);
  if (!sel || sel.start === sel.end) return;
  const on = key === "link" || key === "color" ? value : !hasMark(block.text, sel.start, sel.end, key);
  const next = applyMark(block.text, sel.start, sel.end, key, on as never);
  setText(block.id, next, "mark");
  requestAnimationFrame(() => setSelectionOffsets(el, sel.start, sel.end));
}

interface Props {
  block: Block;
  placeholder?: string;
  className?: string;
  /** Code blocks: plain text, Enter inserts a newline, Tab inserts spaces. */
  plainText?: boolean;
  tag?: "div" | "h1" | "h2" | "h3";
}

export function TextBlock({ block, placeholder, className, plainText, tag = "div" }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const focus = useApp((s) => (s.focus && s.focus.id === block.id ? s.focus : null));

  // Sync DOM from the model only when they differ, so typing never resets the caret.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const fromDom = plainText ? [{ text: el.innerText.replace(/\n$/, "") }].filter((s) => s.text) : domToRich(el);
    if (JSON.stringify(fromDom) === JSON.stringify(block.text)) return;
    const hadFocus = document.activeElement === el;
    const sel = hadFocus ? getSelectionOffsets(el) : null;
    el.innerHTML = plainText ? escapeText(plain(block.text)) : richToHtml(block.text);
    if (hadFocus && sel) setSelectionOffsets(el, Math.min(sel.start, length(block.text)), Math.min(sel.end, length(block.text)));
  }, [block.text, plainText]);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || !focus) return;
    el.focus({ preventScroll: false });
    setSelectionOffsets(el, Math.max(0, Math.min(focus.offset, length(block.text))));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focus?.seq]);

  useEffect(() => () => { if (getUi().slash?.blockId === block.id) setUi({ slash: null }); }, [block.id]);

  const readText = (el: HTMLElement): RichText => (plainText ? (el.innerText.replace(/\n$/, "") ? [{ text: el.innerText.replace(/\n$/, "") }] : []) : domToRich(el));

  const onInput = () => {
    const el = ref.current!;
    const rt = readText(el);
    const sel = getSelectionOffsets(el);
    const caret = sel?.end ?? length(rt);
    const p = plain(rt);
    setText(block.id, rt);
    const prefix = p.slice(0, caret);
    if (!plainText && block.type === "paragraph" && caret <= 4 && (/\s$/.test(prefix) || /^(---|```)$/.test(prefix))) {
      if (shortcut(block.id, prefix)) { setUi({ slash: null }); return; }
    }
    // Slash menu
    const slash = getUi().slash;
    if (slash && slash.blockId === block.id) {
      const q = p.slice(slash.start + 1, caret);
      if (caret <= slash.start || /\s/.test(q) || p[slash.start] !== "/") setUi({ slash: null });
      else setUi({ slash: { ...slash, query: q, index: 0 } });
    } else if (!plainText && p[caret - 1] === "/" && (caret === 1 || /\s/.test(p[caret - 2] ?? " "))) {
      const r = window.getSelection()?.getRangeAt(0).getBoundingClientRect();
      const box = el.getBoundingClientRect();
      setUi({ slash: { blockId: block.id, start: caret - 1, query: "", x: r && r.left ? r.left : box.left, y: (r && r.bottom ? r.bottom : box.bottom) + 4, index: 0 } });
    }
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const el = ref.current!;
    const mod = isMac ? e.metaKey : e.ctrlKey;
    const slash = getUi().slash;
    if (slash && slash.blockId === block.id) {
      const items = filterSlash(slash.query);
      if (e.key === "ArrowDown") { e.preventDefault(); setUi({ slash: { ...slash, index: (slash.index + 1) % Math.max(1, items.length) } }); return; }
      if (e.key === "ArrowUp") { e.preventDefault(); setUi({ slash: { ...slash, index: (slash.index - 1 + items.length) % Math.max(1, items.length) } }); return; }
      if (e.key === "Escape") { e.preventDefault(); setUi({ slash: null }); return; }
      if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault();
        const item = items[slash.index];
        const caret = getSelectionOffsets(el)?.end ?? slash.start + 1 + slash.query.length;
        setUi({ slash: null });
        if (item) chooseBlockType(block.id, item.type, slash.start, caret);
        return;
      }
    }
    if (mod && e.key.toLowerCase() === "z") { e.preventDefault(); if (e.shiftKey) redo(); else undo(); return; }
    if (mod && e.key.toLowerCase() === "y") { e.preventDefault(); redo(); return; }
    if (!plainText && mod && !e.shiftKey && ["b", "i", "u", "e"].includes(e.key.toLowerCase())) {
      e.preventDefault();
      toggleMark(el, block, ({ b: "bold", i: "italic", u: "underline", e: "code" } as const)[e.key.toLowerCase() as "b" | "i" | "u" | "e"]);
      return;
    }
    if (!plainText && mod && e.shiftKey && e.key.toLowerCase() === "s") { e.preventDefault(); toggleMark(el, block, "strike"); return; }
    if (!plainText && mod && e.key.toLowerCase() === "k") {
      e.preventDefault();
      const url = window.prompt("Link URL");
      if (url !== null) toggleMark(el, block, "link", url || undefined);
      return;
    }
    if (e.key === "Escape") { e.preventDefault(); el.blur(); setSelection([block.id]); return; }
    if (mod && e.key.toLowerCase() === "a" && plain(block.text) === "") {
      e.preventDefault();
      const d = getState().ws.pages[getState().current!]!;
      setSelection(d.blocks[d.rootId]!.children);
      el.blur();
      return;
    }
    const sel = getSelectionOffsets(el) ?? { start: 0, end: 0 };
    if (e.key === "Enter" && !e.nativeEvent.isComposing) {
      if (plainText || e.shiftKey) {
        e.preventDefault();
        const rt = insertText(deleteRange(block.text, sel.start, sel.end), sel.start, "\n");
        setText(block.id, rt);
        requestAnimationFrame(() => setSelectionOffsets(el, sel.start + 1));
        return;
      }
      e.preventDefault();
      if (sel.start !== sel.end) setText(block.id, deleteRange(block.text, sel.start, sel.end));
      enter(block.id, sel.start);
      return;
    }
    if (e.key === "Tab") {
      e.preventDefault();
      if (plainText) {
        setText(block.id, insertText(deleteRange(block.text, sel.start, sel.end), sel.start, "  "));
        requestAnimationFrame(() => setSelectionOffsets(el, sel.start + 2));
        return;
      }
      tab(block.id, e.shiftKey, sel.start);
      return;
    }
    if (e.key === "Backspace" && sel.start === 0 && sel.end === 0) { e.preventDefault(); backspace(block.id); return; }
    if (e.key === "ArrowUp" && !e.shiftKey && caretOnEdgeLine(el, "first")) { if (focusSibling(block.id, -1)) e.preventDefault(); return; }
    if (e.key === "ArrowDown" && !e.shiftKey && caretOnEdgeLine(el, "last")) { if (focusSibling(block.id, 1)) e.preventDefault(); return; }
    if (e.key === "ArrowLeft" && sel.start === 0 && sel.end === 0) { if (focusSibling(block.id, -1, true)) e.preventDefault(); return; }
    if (e.key === "ArrowRight" && sel.start === length(block.text) && sel.end === sel.start) { if (focusSibling(block.id, 1)) e.preventDefault(); return; }
  };

  const onPaste = (e: React.ClipboardEvent<HTMLDivElement>) => {
    const el = ref.current!;
    e.preventDefault();
    const data = readClipboard(e.clipboardData);
    const sel = getSelectionOffsets(el) ?? { start: length(block.text), end: length(block.text) };
    const txt = data["text/plain"] ?? "";
    if (plainText || isInlinePaste(data)) {
      let rt = deleteRange(block.text, sel.start, sel.end);
      const isUrl = /^https?:\/\/\S+$/.test(txt.trim());
      if (!plainText && isUrl && sel.start !== sel.end) {
        rt = applyMark(block.text, sel.start, sel.end, "link", txt.trim());
        setText(block.id, rt, "paste");
        return;
      }
      rt = insertText(rt, sel.start, plainText ? txt : txt.replace(/\n/g, " "), isUrl && !plainText ? { link: txt.trim() } : undefined);
      setText(block.id, rt, "paste");
      requestAnimationFrame(() => setSelectionOffsets(el, sel.start + txt.length));
      return;
    }
    pasteBlocks(data, block.id);
  };

  const Tag = tag;
  return (
    <Tag
      ref={ref as never}
      className={`text-block ${className ?? ""}`}
      contentEditable
      suppressContentEditableWarning
      spellCheck
      data-block-id={block.id}
      data-text-block=""
      data-placeholder={placeholder ?? ""}
      data-empty={length(block.text) === 0 ? "" : undefined}
      onInput={onInput}
      onKeyDown={onKeyDown}
      onPaste={onPaste}
      onFocus={() => { if (getState().selection.length) setSelection([]); }}
      onBlur={() => { const s = getUi().slash; if (s?.blockId === block.id) setTimeout(() => setUi({ slash: null }), 150); }}
    />
  );
}

function escapeText(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\n/g, "<br>") + (s.endsWith("\n") ? "<br>" : "");
}

