import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { config } from "./config.js";

mkdirSync(dirname(config.dbPath), { recursive: true });

const db = new DatabaseSync(config.dbPath);
db.exec(`
  CREATE TABLE IF NOT EXISTS conversations (
    key TEXT PRIMARY KEY,
    conversation_id TEXT NOT NULL,
    updated_at INTEGER NOT NULL
  )
`);

const selectStmt = db.prepare("SELECT conversation_id FROM conversations WHERE key = ?");
const upsertStmt = db.prepare(`
  INSERT INTO conversations (key, conversation_id, updated_at) VALUES (?, ?, ?)
  ON CONFLICT(key) DO UPDATE SET conversation_id = excluded.conversation_id, updated_at = excluded.updated_at
`);
const deleteStmt = db.prepare("DELETE FROM conversations WHERE key = ?");

db.exec(`
  CREATE TABLE IF NOT EXISTS chat_inputs (
    key TEXT PRIMARY KEY,
    inputs TEXT NOT NULL,
    pending_query TEXT,
    updated_at INTEGER NOT NULL
  )
`);

const selectInputsStmt = db.prepare("SELECT inputs, pending_query FROM chat_inputs WHERE key = ?");
const upsertInputsStmt = db.prepare(`
  INSERT INTO chat_inputs (key, inputs, pending_query, updated_at) VALUES (?, ?, ?, ?)
  ON CONFLICT(key) DO UPDATE SET inputs = excluded.inputs, pending_query = excluded.pending_query, updated_at = excluded.updated_at
`);
const deleteInputsStmt = db.prepare("DELETE FROM chat_inputs WHERE key = ?");

export type ChatInputs = {
  inputs: Record<string, string>;
  /** 入力変数を聞き終えたら Dify に送る、最初のユーザー発言 */
  pendingQuery?: string;
};

/** トークごとに Dify の入力変数(inputs)と、収集中の保留メッセージを保持する */
export const inputsStore = {
  get(key: string): ChatInputs {
    const row = selectInputsStmt.get(key) as { inputs: string; pending_query: string | null } | undefined;
    if (!row) return { inputs: {} };
    return { inputs: JSON.parse(row.inputs), pendingQuery: row.pending_query ?? undefined };
  },
  set(key: string, value: ChatInputs): void {
    upsertInputsStmt.run(key, JSON.stringify(value.inputs), value.pendingQuery ?? null, Date.now());
  },
  delete(key: string): void {
    deleteInputsStmt.run(key);
  },
};

/** LINEのトーク（ユーザー/グループ/ルーム）ごとに Dify の conversation_id を保持する */
export const conversationStore = {
  get(key: string): string | undefined {
    const row = selectStmt.get(key) as { conversation_id: string } | undefined;
    return row?.conversation_id;
  },
  set(key: string, conversationId: string): void {
    upsertStmt.run(key, conversationId, Date.now());
  },
  delete(key: string): void {
    deleteStmt.run(key);
  },
};
