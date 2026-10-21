/** UUID v4 using crypto when available, with a seedable fallback for tests. */
let counter = 0;
let seeded: (() => string) | null = null;

export function uuid(): string {
  if (seeded) return seeded();
  const c = (globalThis as { crypto?: Crypto }).crypto;
  if (c?.randomUUID) return c.randomUUID();
  counter++;
  const hex = (Date.now().toString(16) + counter.toString(16).padStart(8, "0") + Math.random().toString(16).slice(2)).padEnd(32, "0").slice(0, 32);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

/** Deterministic ids, for fixtures and tests. */
export function seedIds(prefix = 0): () => void {
  let n = prefix;
  seeded = () => {
    n++;
    const h = n.toString(16).padStart(12, "0");
    return `00000000-0000-4000-8000-${h}`;
  };
  return () => { seeded = null; };
}

export function compactId(id: string): string {
  return id.replace(/-/g, "");
}

export function dashedId(id: string): string {
  const h = id.replace(/-/g, "").toLowerCase();
  if (!/^[0-9a-f]{32}$/.test(h)) return id;
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}
