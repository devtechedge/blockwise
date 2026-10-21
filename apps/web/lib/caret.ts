/** Caret helpers that treat a contentEditable element as plain text where <br> is "\n". */

function textLength(n: Node): number {
  if (n.nodeType === Node.TEXT_NODE) return (n.textContent ?? "").length;
  if (n.nodeName === "BR") return 1;
  let len = 0;
  n.childNodes.forEach((c) => { len += textLength(c); });
  return len;
}

/** Character offset of (node, offset) within root. */
export function offsetOf(root: HTMLElement, node: Node, offset: number): number {
  let total = 0;
  const walk = (n: Node): boolean => {
    if (n === node) {
      if (n.nodeType === Node.TEXT_NODE) { total += offset; return true; }
      for (let i = 0; i < offset && i < n.childNodes.length; i++) total += textLength(n.childNodes[i]!);
      return true;
    }
    if (n.nodeType === Node.TEXT_NODE) { total += (n.textContent ?? "").length; return false; }
    if (n.nodeName === "BR") { total += 1; return false; }
    for (const c of Array.from(n.childNodes)) if (walk(c)) return true;
    return false;
  };
  for (const c of Array.from(root.childNodes)) if (walk(c)) return total;
  return total;
}

export function getSelectionOffsets(root: HTMLElement): { start: number; end: number } | null {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return null;
  const r = sel.getRangeAt(0);
  if (!root.contains(r.startContainer) || !root.contains(r.endContainer)) return null;
  const a = offsetOf(root, r.startContainer, r.startOffset);
  const b = offsetOf(root, r.endContainer, r.endOffset);
  return { start: Math.min(a, b), end: Math.max(a, b) };
}

function locate(root: HTMLElement, target: number): { node: Node; offset: number } {
  let remaining = target;
  let found: { node: Node; offset: number } | null = null;
  const walk = (n: Node): boolean => {
    if (n.nodeType === Node.TEXT_NODE) {
      const len = (n.textContent ?? "").length;
      if (remaining <= len) { found = { node: n, offset: remaining }; return true; }
      remaining -= len;
      return false;
    }
    if (n.nodeName === "BR") {
      if (remaining === 0) { const p = n.parentNode!; found = { node: p, offset: Array.prototype.indexOf.call(p.childNodes, n) }; return true; }
      remaining -= 1;
      if (remaining === 0 && !n.nextSibling) { const p = n.parentNode!; found = { node: p, offset: p.childNodes.length }; return true; }
      return false;
    }
    for (const c of Array.from(n.childNodes)) if (walk(c)) return true;
    return false;
  };
  for (const c of Array.from(root.childNodes)) if (walk(c)) break;
  return found ?? { node: root, offset: root.childNodes.length };
}

export function setSelectionOffsets(root: HTMLElement, start: number, end = start): void {
  const sel = window.getSelection();
  if (!sel) return;
  const a = locate(root, start);
  const b = end === start ? a : locate(root, end);
  const r = document.createRange();
  r.setStart(a.node, a.offset);
  r.setEnd(b.node, b.offset);
  sel.removeAllRanges();
  sel.addRange(r);
}

/** True when the caret sits on the first (or last) rendered line of the element. */
export function caretOnEdgeLine(root: HTMLElement, edge: "first" | "last"): boolean {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return true;
  const r = sel.getRangeAt(0).cloneRange();
  r.collapse(true);
  const rect = r.getClientRects()[0];
  const box = root.getBoundingClientRect();
  if (!rect) return true;
  const lh = parseFloat(getComputedStyle(root).lineHeight) || 24;
  return edge === "first" ? rect.top - box.top < lh * 0.8 : box.bottom - rect.bottom < lh * 0.8;
}
