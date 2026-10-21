import { Client } from "@notionhq/client";
import type { NotionApi } from "./sync.js";

/**
 * Create a real API client from an internal integration token the user supplies.
 * The token is never stored by Blockwise; callers keep it in memory only.
 */
export function createNotionApi(token: string, baseUrl?: string): NotionApi {
  return new Client({ auth: token, ...(baseUrl ? { baseUrl } : {}) }) as unknown as NotionApi;
}
