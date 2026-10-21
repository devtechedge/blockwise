"use client";
import { useState } from "react";
import { pageTitle } from "@blockwise/core";
import { createNotionApi, parsePageId, pullPage, pushPage, throttled } from "@blockwise/notion-sync";
import { addDoc, getState, openPage, toast } from "@/lib/store";

/**
 * Talks to the official Notion API with a token the user pastes. The token
 * lives in this component's memory only: it is never saved or logged.
 * Requests go through this site's /api/notion proxy because the Notion API
 * does not allow browser (CORS) calls.
 */
export function SyncDialog({ onClose }: { onClose: () => void }) {
  const [token, setToken] = useState("");
  const [pullUrl, setPullUrl] = useState("");
  const [parentUrl, setParentUrl] = useState("");
  const [busy, setBusy] = useState("");
  const api = () => throttled(createNotionApi(token.trim(), `${location.origin}/api/notion`));

  const pull = async () => {
    const id = parsePageId(pullUrl);
    if (!id) return toast("That does not look like a Notion page link");
    setBusy("Pulling\u2026");
    try {
      const a = api();
      const { doc, childPages } = await pullPage(a, id);
      addDoc(doc, null);
      for (const c of childPages.slice(0, 20)) { const sub = await pullPage(a, c.id); addDoc(sub.doc, doc.rootId); }
      openPage(doc.rootId);
      toast(`Pulled "${pageTitle(getState().ws, doc.rootId)}"${childPages.length ? ` with ${Math.min(20, childPages.length)} sub page(s)` : ""}`);
      onClose();
    } catch (e) { toast("Pull failed: " + (e as Error).message); } finally { setBusy(""); }
  };

  const push = async () => {
    const parent = parsePageId(parentUrl);
    const st = getState();
    if (!parent || !st.current) return toast("Paste the link of the Notion page to create the copy under");
    setBusy("Pushing\u2026");
    try {
      const r = await pushPage(api(), st.ws.pages[st.current]!, parent);
      toast(`Created a Notion page with ${r.blocks} blocks`);
      onClose();
    } catch (e) { toast("Push failed: " + (e as Error).message); } finally { setBusy(""); }
  };

  return (
    <div className="modal-back" role="dialog" aria-modal="true" aria-label="Notion API sync" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal">
        <h2>Notion API sync</h2>
        <p className="muted">Optional. Create an internal integration at notion.so/profile/integrations, share the pages with it, and paste its secret here. The secret stays in this tab's memory and is sent only with requests to the Notion API.</p>
        <label>Integration secret<input type="password" autoComplete="off" value={token} onChange={(e) => setToken(e.target.value)} placeholder="ntn_..." /></label>
        <fieldset>
          <legend>Pull a page into Blockwise</legend>
          <input aria-label="Notion page link to pull" value={pullUrl} onChange={(e) => setPullUrl(e.target.value)} placeholder="https://www.notion.so/..." />
          <button disabled={!token || !!busy} onClick={pull}>Pull</button>
        </fieldset>
        <fieldset>
          <legend>Push the current page to Notion</legend>
          <input aria-label="Parent Notion page link" value={parentUrl} onChange={(e) => setParentUrl(e.target.value)} placeholder="Parent page link" />
          <button disabled={!token || !!busy} onClick={push}>Push</button>
        </fieldset>
        {busy && <p role="status">{busy}</p>}
        <button className="close" onClick={onClose}>Close</button>
      </div>
    </div>
  );
}
