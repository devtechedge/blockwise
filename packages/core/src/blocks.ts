import type { Color, RichText } from "./rich-text.js";

export type BlockType =
  | "paragraph" | "heading_1" | "heading_2" | "heading_3"
  | "to_do" | "bulleted_list_item" | "numbered_list_item" | "toggle"
  | "quote" | "callout" | "code" | "divider" | "image" | "equation"
  | "table" | "table_row" | "column_list" | "column"
  | "page" | "database";

export const TEXT_TYPES: ReadonlySet<BlockType> = new Set([
  "paragraph", "heading_1", "heading_2", "heading_3", "to_do", "bulleted_list_item",
  "numbered_list_item", "toggle", "quote", "callout", "code",
]);

export const CONTAINER_TYPES: ReadonlySet<BlockType> = new Set([
  "paragraph", "to_do", "bulleted_list_item", "numbered_list_item", "toggle", "quote", "callout",
  "table", "column_list", "column", "page",
]);

export interface BlockProps {
  checked?: boolean;
  language?: string;
  icon?: string;
  color?: Color;
  url?: string;
  caption?: RichText;
  expression?: string;
  /** table: number of columns and whether the first row/column is a header */
  width?: number;
  hasColumnHeader?: boolean;
  hasRowHeader?: boolean;
  /** table_row: one rich text per cell */
  cells?: RichText[];
  /** column: relative width ratio */
  ratio?: number;
  /** database: id of the database record in the document */
  databaseId?: string;
}

export interface Block {
  id: string;
  type: BlockType;
  text: RichText;
  props: BlockProps;
  children: string[];
  parent: string | null;
}

export interface Doc {
  rootId: string;
  blocks: Record<string, Block>;
}

export interface BlockInput {
  type: BlockType;
  text?: RichText;
  props?: BlockProps;
  children?: BlockInput[];
  id?: string;
}
