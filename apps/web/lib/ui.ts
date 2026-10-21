"use client";
import { useSyncExternalStore } from "react";
import type { BlockType } from "@blockwise/core";

/** Short lived UI state that is not part of the document. */
export interface UiState {
  slash: { blockId: string; start: number; query: string; x: number; y: number; index: number } | null;
  drop: { id: string; pos: "before" | "after" | "inside" } | null;
  dragging: string | null;
}

let ui: UiState = { slash: null, drop: null, dragging: null };
const ls = new Set<() => void>();
export function getUi(): UiState { return ui; }
export function setUi(p: Partial<UiState>): void { ui = { ...ui, ...p }; ls.forEach((l) => l()); }
export function useUi<T>(sel: (u: UiState) => T): T {
  return useSyncExternalStore((l) => { ls.add(l); return () => ls.delete(l); }, () => sel(ui), () => sel(ui));
}

export interface SlashItem { type: BlockType | "page" | "database"; label: string; hint: string; keywords: string; icon: string }

export const SLASH_ITEMS: SlashItem[] = [
  { type: "paragraph", label: "Text", hint: "Plain text", keywords: "text paragraph plain", icon: "Aa" },
  { type: "heading_1", label: "Heading 1", hint: "# ", keywords: "h1 heading title big", icon: "H1" },
  { type: "heading_2", label: "Heading 2", hint: "## ", keywords: "h2 heading subtitle", icon: "H2" },
  { type: "heading_3", label: "Heading 3", hint: "### ", keywords: "h3 heading small", icon: "H3" },
  { type: "to_do", label: "To-do list", hint: "[] ", keywords: "todo task checkbox check", icon: "\u2611" },
  { type: "bulleted_list_item", label: "Bulleted list", hint: "- ", keywords: "bullet list unordered ul", icon: "\u2022" },
  { type: "numbered_list_item", label: "Numbered list", hint: "1. ", keywords: "number list ordered ol", icon: "1." },
  { type: "toggle", label: "Toggle list", hint: "> ", keywords: "toggle collapse details", icon: "\u25B8" },
  { type: "quote", label: "Quote", hint: "\" ", keywords: "quote blockquote citation", icon: "\u201C" },
  { type: "callout", label: "Callout", hint: "Highlighted note", keywords: "callout note info aside", icon: "\u{1F4A1}" },
  { type: "code", label: "Code", hint: "```", keywords: "code snippet pre program", icon: "</>" },
  { type: "divider", label: "Divider", hint: "---", keywords: "divider line hr separator", icon: "\u2014" },
  { type: "equation", label: "Block equation", hint: "TeX", keywords: "equation math tex latex formula", icon: "\u03A3" },
  { type: "image", label: "Image", hint: "Link or upload", keywords: "image picture photo img", icon: "\u{1F5BC}" },
  { type: "table", label: "Table", hint: "Simple table", keywords: "table grid rows columns", icon: "\u25A6" },
  { type: "column_list", label: "2 columns", hint: "Side by side", keywords: "columns layout side", icon: "\u2016" },
  { type: "database", label: "Database", hint: "Table view", keywords: "database table view collection csv", icon: "\u{1F5C3}" },
  { type: "page", label: "Page", hint: "Sub page", keywords: "page subpage child", icon: "\u{1F4C4}" },
];

export function filterSlash(q: string): SlashItem[] {
  const s = q.trim().toLowerCase();
  if (!s) return SLASH_ITEMS;
  return SLASH_ITEMS.filter((i) => i.label.toLowerCase().includes(s) || i.keywords.includes(s));
}
