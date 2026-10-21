"use client";
import { useEffect } from "react";
import { boot, flush, openPage, useApp } from "@/lib/store";
import { Sidebar } from "./Sidebar";
import { EditorHost } from "./Editor";
import { Toast } from "./Toast";

export function App() {
  const ready = useApp((s) => s.ready);
  const theme = useApp((s) => s.theme);
  useEffect(() => {
    void boot();
    const onHash = () => { const id = decodeURIComponent(location.hash.slice(1)); if (id) openPage(id); };
    const onHide = () => { void flush(); };
    window.addEventListener("hashchange", onHash);
    window.addEventListener("pagehide", onHide);
    return () => { window.removeEventListener("hashchange", onHash); window.removeEventListener("pagehide", onHide); };
  }, []);
  useEffect(() => { document.documentElement.dataset.theme = theme; }, [theme]);
  if (!ready) return <div className="loading">Loading your pages\u2026</div>;
  return (
    <div className="app">
      <Sidebar />
      <EditorHost />
      <Toast />
    </div>
  );
}
