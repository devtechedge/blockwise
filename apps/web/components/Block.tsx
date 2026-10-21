"use client";
import { memo, useState } from "react";
import { applyOp as applyOpSync, getBlock, indexInParent, listNumber, opInsert, opMove, opUpdate, plain, type Block as B, type Doc, type RichText } from "@blockwise/core";
import { apply, getState, setSelection, useApp, requestFocus } from "@/lib/store";
import { setProps, topLevelSelection } from "@/lib/actions";
import { setUi, useUi, getUi } from "@/lib/ui";
import { TextBlock } from "./TextBlock";
import { DatabaseView } from "./DatabaseView";
import { CellEditor } from "./CellEditor";
import { openBlockMenu } from "./BlockMenu";

const LANGS = ["plain text", "bash", "c", "c++", "c#", "css", "go", "html", "java", "javascript", "json", "kotlin", "markdown", "python", "ruby", "rust", "shell", "sql", "swift", "typescript", "yaml"];

export function BlockList({ doc, ids }: { doc: Doc; ids: string[] }) {
  return <>{ids.map((id) => <BlockView key={id} doc={doc} block={doc.blocks[id]!} />)}</>;
}

function placeholderFor(b: B): string {
  switch (b.type) {
    case "heading_1": return "Heading 1";
    case "heading_2": return "Heading 2";
    case "heading_3": return "Heading 3";
    case "to_do": return "To-do";
    case "bulleted_list_item": case "numbered_list_item": return "List";
    case "toggle": return "Toggle";
    case "quote": return "Empty quote";
    case "callout": return "Type something";
    case "code": return "Code";
    default: return "Type '/' for commands";
  }
}

function onDragStart(e: React.DragEvent, id: string) {
  const sel = getState().selection;
  e.dataTransfer.setData("application/x-blockwise-block", id);
  e.dataTransfer.effectAllowed = "move";
  if (!sel.includes(id)) setSelection([id]);
  setUi({ dragging: id });
}

function dropPosition(e: React.DragEvent, el: HTMLElement): "before" | "after" | "inside" {
  const r = el.getBoundingClientRect();
  if (e.clientX - r.left > 120 && e.clientY > r.top + r.height / 2) return "inside";
  return e.clientY < r.top + r.height / 2 ? "before" : "after";
}

export function performDrop(doc: Doc, targetId: string, pos: "before" | "after" | "inside"): void {
  const dragged = getUi().dragging;
  setUi({ dragging: null, drop: null });
  if (!dragged) return;
  const st = getState();
  const ids = topLevelSelection(doc, st.selection.includes(dragged) ? st.selection : [dragged]);
  if (ids.includes(targetId)) return;
  const target = getBlock(doc, targetId);
  let cur = doc;
  const ops: ReturnType<typeof opMove>[] = [];
  let parent = pos === "inside" ? targetId : target.parent!;
  let index = pos === "inside" ? target.children.length : indexInParent(doc, targetId) + (pos === "after" ? 1 : 0);
  for (const id of ids) {
    try {
      const op = opMove(cur, id, parent, index);
      ops.push(op);
      cur = applyMoveLocal(cur, op);
      index = indexInParent(cur, id) + 1;
      parent = getBlock(cur, id).parent!;
    } catch { /* cannot move into itself */ }
  }
  apply(ops);
}

function applyMoveLocal(d: Doc, op: Parameters<typeof applyOpSync>[1]): Doc { return applyOpSync(d, op); }

export const BlockView = memo(function BlockView({ doc, block }: { doc: Doc; block: B }) {
  const selected = useApp((s) => s.selection.includes(block.id));
  const drop = useUi((u) => (u.drop?.id === block.id ? u.drop.pos : null));
  const [open, setOpen] = useState(true);
  const b = block;
  const kids = b.children.length ? <div className="children"><BlockList doc={doc} ids={b.children} /></div> : null;

  let content: React.ReactNode;
  switch (b.type) {
    case "paragraph": content = <><TextBlock block={b} placeholder={placeholderFor(b)} />{kids}</>; break;
    case "heading_1": content = <TextBlock block={b} tag="h1" className="h1" placeholder="Heading 1" />; break;
    case "heading_2": content = <TextBlock block={b} tag="h2" className="h2" placeholder="Heading 2" />; break;
    case "heading_3": content = <TextBlock block={b} tag="h3" className="h3" placeholder="Heading 3" />; break;
    case "bulleted_list_item":
      content = <div className="list-row"><span className="marker" aria-hidden>{["\u2022", "\u25E6", "\u25AA"][depthOf(doc, b) % 3]}</span><div className="grow"><TextBlock block={b} placeholder="List" />{kids}</div></div>; break;
    case "numbered_list_item":
      content = <div className="list-row"><span className="marker num" aria-hidden>{listNumber(doc, b.id)}.</span><div className="grow"><TextBlock block={b} placeholder="List" />{kids}</div></div>; break;
    case "to_do":
      content = <div className="list-row"><input type="checkbox" className="todo-box" aria-label="Done" checked={Boolean(b.props.checked)} onChange={(e) => setProps(b.id, { checked: e.target.checked })} /><div className={`grow ${b.props.checked ? "done" : ""}`}><TextBlock block={b} placeholder="To-do" />{kids}</div></div>; break;
    case "toggle":
      content = <div className="list-row"><button className={`toggle-btn ${open ? "open" : ""}`} aria-label={open ? "Collapse" : "Expand"} aria-expanded={open} onClick={() => setOpen(!open)}>{"\u25B6"}</button><div className="grow"><TextBlock block={b} placeholder="Toggle" />{open ? (kids ?? <button className="empty-toggle" onClick={() => apply([opInsert(doc, b.id, 0, { type: "paragraph" })], undefined, undefined)}>Empty toggle. Click to add a block.</button>) : null}</div></div>; break;
    case "quote": content = <div className="quote"><TextBlock block={b} placeholder="Empty quote" />{kids}</div>; break;
    case "callout":
      content = <div className={`callout ${b.props.color ? "bg-" + b.props.color : ""}`}><button className="callout-icon" aria-label="Change icon" onClick={() => { const v = window.prompt("Icon (emoji)", b.props.icon ?? ""); if (v) setProps(b.id, { icon: v }); }}>{b.props.icon ?? "\u{1F4A1}"}</button><div className="grow"><TextBlock block={b} placeholder="Type something" />{kids}</div></div>; break;
    case "code":
      content = <div className="code"><select className="code-lang" aria-label="Language" value={b.props.language ?? "plain text"} onChange={(e) => setProps(b.id, { language: e.target.value })}>{[...new Set([b.props.language ?? "plain text", ...LANGS])].map((l) => <option key={l} value={l}>{l}</option>)}</select><TextBlock block={b} plainText placeholder="Code" /></div>; break;
    case "divider": content = <hr className="divider" onClick={() => setSelection([b.id])} />; break;
    case "equation": content = <EquationBlock block={b} />; break;
    case "image": content = <ImageBlock block={b} />; break;
    case "table": content = <TableBlock doc={doc} block={b} />; break;
    case "column_list":
      content = <div className="columns">{b.children.map((cid) => { const c = doc.blocks[cid]!; return <div key={cid} className="column" style={{ flex: c.props.ratio ?? 1 }}><BlockList doc={doc} ids={c.children} />{!c.children.length && <button className="empty-toggle" onClick={() => apply([opInsert(doc, cid, 0, { type: "paragraph" })])}>Add a block</button>}</div>; })}</div>; break;
    case "database": content = b.props.databaseId ? <DatabaseView id={b.props.databaseId} /> : null; break;
    case "page": content = <a className="page-link" href={"#" + b.id}>{"\u{1F4C4}"} {plain(b.text) || "Untitled"}</a>; break;
    default: content = <TextBlock block={b} />;
  }

  return (
    <div
      className={`block block-${b.type} ${selected ? "selected" : ""} ${drop ? "drop-" + drop : ""}`}
      data-id={b.id}
      data-type={b.type}
      onDragOver={(e) => {
        if (!getUi().dragging) return;
        e.preventDefault();
        e.stopPropagation();
        const pos = dropPosition(e, e.currentTarget);
        const cur = getUi().drop;
        if (cur?.id !== b.id || cur.pos !== pos) setUi({ drop: { id: b.id, pos } });
      }}
      onDrop={(e) => { e.preventDefault(); e.stopPropagation(); const d = getUi().drop; if (d) performDrop(doc, d.id, d.pos); }}
    >
      <div className="gutter" contentEditable={false}>
        <button className="add-btn" title="Add a block below" aria-label="Add a block below" onClick={() => {
          const op = opInsert(doc, b.parent!, indexInParent(doc, b.id) + 1, { type: "paragraph" });
          apply([op], undefined, { id: (op as { blocks: { id: string }[] }).blocks[0]!.id, offset: 0 });
        }}>+</button>
        <span className="handle" draggable title="Drag to move, click for the block menu" aria-label="Drag handle" role="button" tabIndex={-1}
          onDragStart={(e) => onDragStart(e, b.id)}
          onDragEnd={() => setUi({ dragging: null, drop: null })}
          aria-haspopup="menu"
          onClick={(e) => {
            const sel = getState().selection;
            if (e.shiftKey && sel.length) { setSelection([...sel, b.id]); return; }
            if (!sel.includes(b.id)) setSelection([b.id]);
            (document.activeElement as HTMLElement | null)?.blur();
            openBlockMenu(b.id, e.currentTarget);
          }}
          onContextMenu={(e) => {
            e.preventDefault();
            if (!getState().selection.includes(b.id)) setSelection([b.id]);
            (document.activeElement as HTMLElement | null)?.blur();
            openBlockMenu(b.id, e.currentTarget);
          }}>{"\u22EE\u22EE"}</span>
      </div>
      <div className={`block-content${b.props.color && b.type !== "callout" ? " block-color-" + b.props.color : ""}`}>{content}</div>
    </div>
  );
});

function depthOf(doc: Doc, b: B): number {
  let d = 0;
  let p = b.parent;
  while (p && p !== doc.rootId) { if (doc.blocks[p]?.type === "bulleted_list_item") d++; p = doc.blocks[p]?.parent ?? null; }
  return d;
}

function EquationBlock({ block }: { block: B }) {
  const [editing, setEditing] = useState(!block.props.expression);
  const expr = block.props.expression ?? "";
  if (editing) return <textarea className="equation-input" autoFocus aria-label="TeX expression" defaultValue={expr} placeholder="E = mc^2" onBlur={(e) => { setProps(block.id, { expression: e.target.value }); setEditing(false); }} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); (e.target as HTMLTextAreaElement).blur(); } }} />;
  return <div className="equation" role="button" tabIndex={0} onClick={() => setEditing(true)} title="Click to edit TeX">{expr || "Empty equation"}</div>;
}

function ImageBlock({ block }: { block: B }) {
  const url = block.props.url ?? "";
  if (!url) {
    return (
      <div className="image-empty">
        <input aria-label="Image URL" placeholder="Paste an image link and press Enter" onKeyDown={(e) => { if (e.key === "Enter") setProps(block.id, { url: (e.target as HTMLInputElement).value.trim() }); }} />
        <label className="btn">Upload<input type="file" accept="image/*" hidden onChange={(e) => {
          const f = e.target.files?.[0];
          if (!f) return;
          const r = new FileReader();
          r.onload = () => setProps(block.id, { url: String(r.result) });
          r.readAsDataURL(f);
        }} /></label>
      </div>
    );
  }
  return (
    <figure className="image">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={url} alt={plain(block.props.caption ?? []) || "Image"} />
      <figcaption><input aria-label="Caption" placeholder="Add a caption" defaultValue={plain(block.props.caption ?? [])} onBlur={(e) => setProps(block.id, { caption: e.target.value ? [{ text: e.target.value }] : undefined })} /></figcaption>
    </figure>
  );
}

function TableBlock({ doc, block }: { doc: Doc; block: B }) {
  const width = block.props.width ?? 0;
  const rows = block.children.map((id) => doc.blocks[id]!);
  const setCell = (row: B, ci: number, rt: RichText) => {
    const cells = Array.from({ length: width }, (_, i) => row.props.cells?.[i] ?? []);
    cells[ci] = rt;
    apply([opUpdate(doc, row.id, { props: { ...row.props, cells } })], "cell:" + row.id + ":" + ci);
  };
  const addRow = () => apply([opInsert(doc, block.id, rows.length, { type: "table_row", props: { cells: Array.from({ length: width }, () => []) } })]);
  const addCol = () => {
    const ops = [opUpdate(doc, block.id, { props: { ...block.props, width: width + 1 } }), ...rows.map((r) => opUpdate(doc, r.id, { props: { ...r.props, cells: [...Array.from({ length: width }, (_, i) => r.props.cells?.[i] ?? []), []] } }))];
    apply(ops);
  };
  return (
    <div className="table-wrap">
      <table className="simple-table">
        <tbody>
          {rows.map((r, ri) => (
            <tr key={r.id}>
              {Array.from({ length: width }, (_, ci) => {
                const head = (block.props.hasColumnHeader && ri === 0) || (block.props.hasRowHeader && ci === 0);
                return <td key={ci} className={head ? "th" : ""}><CellEditor value={r.props.cells?.[ci] ?? []} onChange={(rt) => setCell(r, ci, rt)} label={`Row ${ri + 1} column ${ci + 1}`} /></td>;
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <div className="table-tools">
        <button onClick={addRow}>+ Row</button>
        <button onClick={addCol}>+ Column</button>
        <label><input type="checkbox" checked={Boolean(block.props.hasColumnHeader)} onChange={(e) => setProps(block.id, { hasColumnHeader: e.target.checked })} /> Header row</label>
        <label><input type="checkbox" checked={Boolean(block.props.hasRowHeader)} onChange={(e) => setProps(block.id, { hasRowHeader: e.target.checked })} /> Header column</label>
      </div>
    </div>
  );
}

export { requestFocus };
