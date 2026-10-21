import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

export function readTree(rel: string): Record<string, Uint8Array> {
  const root = fileURLToPath(new URL(`../fixtures/exports/${rel}/`, import.meta.url));
  const out: Record<string, Uint8Array> = {};
  const walk = (d: string) => {
    for (const f of readdirSync(d)) {
      const p = join(d, f);
      if (statSync(p).isDirectory()) walk(p); else out[relative(root, p).split("\\").join("/")] = new Uint8Array(readFileSync(p));
    }
  };
  walk(root);
  return out;
}
