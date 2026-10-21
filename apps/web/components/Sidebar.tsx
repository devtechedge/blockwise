"use client";
import { useState } from "react";
import { childPages, pageTitle, searchPages } from "@blockwise/core";
import { exportZip, importNotionFiles, importNotionZip } from "@blockwise/interop";
import { createPage, deletePage, getState, mergeWorkspace, movePage, openPage, resetWorkspace, toast, useApp } from "@/lib/store";
import { download } from "@/lib/files";
import { SyncDialog } from "./SyncDialog";

function PageNode({ id, depth }: { id: string; depth: number }) {
  const ws = useApp((s) => s.ws);
  const current = useApp((s) => s.current);
  const [open, setOpen] = useState(true);
  const kids = childPages(ws, id);
  const icon = ws.pages[id]?.blocks[id]?.props.icon;
  return (
    <li>
      <div className={`tree-row ${current === id ? "active" : ""}`} style={{ paddingLeft: 8 + depth * 14 }}
        draggable onDragStart={(e) => e.dataTransfer.setData("application/x-blockwise-page", id)}
        onDragOver={(e) => { if (e.dataTransfer.types.includes("application/x-blockwise-page")) e.preventDefault(); }}
        onDrop={(e) => { const src = e.dataTransfer.getData("application/x-blockwise-page"); if (src && src !== id) movePage(src, id, childPages(getState().ws, id).length); }}>
        <button className="tree-toggle" aria-label={open ? "Collapse" : "Expand"} onClick={() => setOpen(!open)} style={{ visibility: kids.length ? "visible" : "hidden" }}>{open ? "\u25BE" : "\u25B8"}</button>
        <a href={"#" + id} className="tree-link" onClick={(e) => { e.preventDefault(); openPage(id); }}>{icon ?? "\u{1F4C4}"} {pageTitle(ws, id)}</a>
        <button className="tree-act" aria-label="Add sub page" title="Add a page inside" onClick={() => { setOpen(true); createPage(id); }}>+</button>
        <button className="tree-act" aria-label="Delete page" title="Delete" onClick={() => { if (confirm(`Delete "${pageTitle(ws, id)}" and its sub pages?`)) deletePage(id); }}>{"\u00D7"}</button>
      </div>
      {open && kids.length > 0 && <ul>{kids.map((k) => <PageNode key={k} id={k} depth={depth + 1} />)}</ul>}
    </li>
  );
}

export function Sidebar() {
  const ws = useApp((s) => s.ws);
  const [q, setQ] = useState("");
  const [sync, setSync] = useState(false);
  const [menu, setMenu] = useState(false);
  const hits = q ? searchPages(ws, q) : [];

  const onImport = async (files: FileList | null) => {
    if (!files?.length) return;
    let first: string | null = null;
    for (const f of Array.from(files)) {
      const bytes = new Uint8Array(await f.arrayBuffer());
      try {
        const res = f.name.toLowerCase().endsWith(".zip") ? importNotionZip(bytes) : importNotionFiles({ [f.name]: bytes });
        first = mergeWorkspace(res.workspace) ?? first;
        toast(`Imported ${res.report.pages} page${res.report.pages === 1 ? "" : "s"}, ${res.report.databases} database${res.report.databases === 1 ? "" : "s"}, ${res.report.images} image${res.report.images === 1 ? "" : "s"}`);
      } catch (e) {
        toast("Import failed: " + (e as Error).message);
      }
    }
    if (first) openPage(first);
  };

  const onExport = (format: "markdown" | "html") => {
    const st = getState();
    if (!st.current) return;
    const zip = exportZip(st.ws, format, [st.current]);
    download(`${pageTitle(st.ws, st.current)} (${format === "markdown" ? "Markdown & CSV" : "HTML"}).zip`, new Blob([zip as BlobPart], { type: "application/zip" }));
    setMenu(false);
  };

  return (
    <aside className="sidebar" aria-label="Pages">
      <div className="brand"><span className="logo" aria-hidden>{"\u25A6"}</span> Blockwise</div>
      <input className="search" type="search" placeholder="Search" aria-label="Search pages" value={q} onChange={(e) => setQ(e.target.value)} />
      {q && (
        <ul className="hits">
          {hits.length ? hits.map((id) => <li key={id}><a href={"#" + id} onClick={(e) => { e.preventDefault(); openPage(id); setQ(""); }}>{pageTitle(ws, id)}</a></li>) : <li className="muted">No matches</li>}
        </ul>
      )}
      <nav className="tree"><ul>{childPages(ws, null).map((id) => <PageNode key={id} id={id} depth={0} />)}</ul></nav>
      <button className="side-btn" onClick={() => createPage(null)}>+ New page</button>
      <div className="side-bottom">
        <label className="side-btn">Import<input type="file" accept=".zip,.md,.html,.csv" multiple hidden onChange={(e) => { void onImport(e.target.files); e.target.value = ""; }} /></label>
        <div className="menu-wrap">
          <button className="side-btn" aria-haspopup="menu" aria-expanded={menu} onClick={() => setMenu(!menu)}>Export</button>
          {menu && (
            <div className="menu" role="menu">
              <button role="menuitem" onClick={() => onExport("markdown")}>Markdown &amp; CSV (.zip)</button>
              <button role="menuitem" onClick={() => onExport("html")}>HTML (.zip)</button>
            </div>
          )}
        </div>
        <button className="side-btn" onClick={() => setSync(true)}>Notion API sync</button>
        <button className="side-btn muted" onClick={() => { if (confirm("Replace everything with the demo pages?")) void resetWorkspace(); }}>Reset demo</button>
        <a className="side-link" href="https://github.com/devtechedge/blockwise" target="_blank" rel="noreferrer">Source on GitHub</a>
      </div>
      {sync && <SyncDialog onClose={() => setSync(false)} />}
    </aside>
  );
}
