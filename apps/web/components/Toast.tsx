"use client";
import { useEffect, useState } from "react";
import { useApp } from "@/lib/store";

export function Toast() {
  const t = useApp((s) => s.toast);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    if (!t) return;
    setVisible(true);
    const h = setTimeout(() => setVisible(false), 2800);
    return () => clearTimeout(h);
  }, [t?.seq]);
  return <div className={`toast ${visible ? "show" : ""}`} role="status" aria-live="polite">{t?.text}</div>;
}
