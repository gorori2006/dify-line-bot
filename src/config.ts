import "dotenv/config";

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`環境変数 ${name} が設定されていません（.env を確認してください）`);
  }
  return value;
}

export const config = {
  line: {
    channelSecret: required("LINE_CHANNEL_SECRET"),
    channelAccessToken: required("LINE_CHANNEL_ACCESS_TOKEN"),
  },
  dify: {
    apiKey: required("DIFY_API_KEY"),
    baseUrl: (process.env.DIFY_BASE_URL ?? "https://api.dify.ai/v1").replace(/\/+$/, ""),
    timeoutMs: Number(process.env.DIFY_TIMEOUT_MS ?? 90_000),
  },
  port: Number(process.env.PORT ?? 3000),
  dbPath: process.env.DB_PATH ?? "./data/conversations.db",
  resetKeywords: (process.env.RESET_KEYWORDS ?? "リセット,reset")
    .split(",")
    .map((k) => k.trim().toLowerCase())
    .filter(Boolean),
};
