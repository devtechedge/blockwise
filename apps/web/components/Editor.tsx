"use client";
import { useEffect, useRef } from "react";
import { getBlock, pageTitle, opInsert, opUpdate, plain, type Doc } from "@blockwise/core";
import { apply, getState, redo, setSelection, undo, useApp } from "@/lib/store";
import { copySelection, deleteSelection, isInlinePaste, pasteAtTop, duplicateSelection, moveSelection, pasteBlocks, readClipboard, topLevelSelection } from "@/lib/actions";
import { BlockList } from "./Block";
import { BlockMenu } from "./BlockMenu";
import { SlashMenu } from "./SlashMenu";
import { InlineToolbar } from "./InlineToolbar";
import { ThemeToggle } from "./ThemeToggle";

const isMac = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);

export function Editor({ doc }: { doc: Doc }) {
  const root = getBlock(doc, doc.rootId);
  const titleRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    const el = titleRef.current;
    if (el && el.innerText !== plain(root.text)) el.innerText = plain(root.text);
  }, [root.text]);

  useEffect(() => {
    if (!root.text.length && root.children.length <= 1) titleRef.current?.focus();
    // only on first mount of this page
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keyboard handling while blocks (not text) are selected.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const st = getState();
      const mod = isMac ? e.metaKey : e.ctrlKey;
      const inText = (e.target as HTMLElement | null)?.closest?.("[contenteditable=true], input, textarea, select");
      if (inText) return;
      if (mod && e.key.toLowerCase() === "z") { e.preventDefault(); if (e.shiftKey) redo(); else undo(); return; }
      if (!st.selection.length) return;
      if (e.key === "Escape") { setSelection([]); return; }
      if (e.key === "Backspace" || e.key === "Delete") { e.preventDefault(); deleteSelection(); return; }
      if (e.key === "ArrowUp" || e.key === "ArrowDown") { e.preventDefault(); moveSelection(e.key === "ArrowUp" ? -1 : 1, e.shiftKey); return; }
      if (mod && e.key.toLowerCase() === "d") { e.preventDefault(); duplicateSelection(); return; }
      if (mod && e.key.toLowerCase() === "a") { e.preventDefault(); setSelection(getBlock(doc, doc.rootId).children); return; }
      if (e.key === "Enter") {
        e.preventDefault();
        const id = topLevelSelection(doc, st.selection)[0];
        setSelection([]);
        if (id) { const el = document.querySelector<HTMLElement>(`[data-block-id="${id}"]`); el?.focus(); }
      }
    };
    const onCopy = (e: ClipboardEvent) => { if (getState().selection.length) copySelection(e, false); };
    const onCut = (e: ClipboardEvent) => { if (getState().selection.length) copySelection(e, true); };
    const onPaste = (e: ClipboardEvent) => {
      const st = getState();
      if (!st.selection.length || !e.clipboardData) return;
      e.preventDefault();
      const ids = topLevelSelection(doc, st.selection);
      pasteBlocks(readClipboard(e.clipboardData), ids[ids.length - 1]!);
      setSelection([]);
    };
    const onMouseDown = (e: MouseEvent) => {
      const t = e.target as HTMLElement;
      if (getState().selection.length && !t.closest(".handle, .block-menu")) setSelection([]);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("copy", onCopy);
    document.addEventListener("cut", onCut);
    document.addEventListener("paste", onPaste);
    document.addEventListener("mousedown", onMouseDown);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("copy", onCopy);
      document.removeEventListener("cut", onCut);
      document.removeEventListener("paste", onPaste);
      document.removeEventListener("mousedown", onMouseDown);
    };
  }, [doc]);

  const addAtEnd = () => {
    const last = root.children[root.children.length - 1];
    const lb = last ? doc.blocks[last] : null;
    if (lb && lb.type === "paragraph" && !lb.text.length) {
      document.querySelector<HTMLElement>(`[data-block-id="${last}"]`)?.focus();
      return;
    }
    const op = opInsert(doc, doc.rootId, root.children.length, { type: "paragraph" });
    apply([op], undefined, { id: (op as { blocks: { id: string }[] }).blocks[0]!.id, offset: 0 });
  };

  return (
    <main className="editor" aria-label="Page editor">
      <div className="page-head">
        {root.props.icon && <div className="page-icon" aria-hidden>{root.props.icon}</div>}
        <h1
          ref={titleRef}
          className="page-title"
          contentEditable
          suppressContentEditableWarning
          data-placeholder="Untitled"
          aria-label="Page title"
          onInput={(e) => apply([opUpdate(doc, doc.rootId, { text: (e.currentTarget.innerText.trim() ? [{ text: e.currentTarget.innerText.replace(/\n/g, " ") }] : []) })], "title")}
          onPaste={(e) => {
            // Multi block pastes go into the body instead of flattening into the title.
            const data = readClipboard(e.nativeEvent.clipboardData ?? new DataTransfer());
            if (isInlinePaste(data)) {
              e.preventDefault();
              document.execCommand("insertText", false, (data["text/plain"] ?? "").replace(/\s+/g, " "));
              return;
            }
            e.preventDefault();
            pasteAtTop(data);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" || (e.key === "ArrowDown")) {
              e.preventDefault();
              const first = root.children[0];
              if (first && doc.blocks[first]?.type === "paragraph") document.querySelector<HTMLElement>(`[data-block-id="${first}"]`)?.focus();
              else { const op = opInsert(doc, doc.rootId, 0, { type: "paragraph" }); apply([op], undefined, { id: (op as { blocks: { id: string }[] }).blocks[0]!.id, offset: 0 }); }
            }
          }}
        />
      </div>
      <div className="blocks">
        <BlockList doc={doc} ids={root.children} />
      </div>
      <div className="page-tail" onClick={addAtEnd} aria-hidden />
      <SlashMenu />
      <BlockMenu />
      <InlineToolbar />
    </main>
  );
}

export function EditorHost() {
  const doc = useApp((s) => (s.current ? s.ws.pages[s.current] ?? null : null));
  const title = useApp((s) => (s.current ? pageTitle(s.ws, s.current) : ""));
  return (
    <div className="main-col">
      <header className="topbar">
        <span className="crumb">{title}</span>
        <div className="top-actions"><ThemeToggle /></div>
      </header>
      {doc ? <Editor key={doc.rootId} doc={doc} /> : <main className="editor empty">No page selected</main>}
    </div>
  );
}
