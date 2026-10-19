import { config } from "./config.js";

export type DifyReply = {
  answer: string;
  conversationId: string;
};

export class DifyApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string | undefined,
    message: string,
  ) {
    super(message);
  }
}

export type InputField = {
  variable: string;
  label: string;
  type: string;
  required: boolean;
  options?: string[];
};

const PARAMETERS_CACHE_MS = 5 * 60_000;
let parametersCache: { fields: InputField[]; fetchedAt: number } | undefined;

/** Dify アプリの入力変数（開始時の変数）の定義を取得する。5分間キャッシュする */
export async function getInputFields(): Promise<InputField[]> {
  if (parametersCache && Date.now() - parametersCache.fetchedAt < PARAMETERS_CACHE_MS) {
    return parametersCache.fields;
  }
  const res = await fetch(`${config.dify.baseUrl}/parameters`, {
    headers: { Authorization: `Bearer ${config.dify.apiKey}` },
    signal: AbortSignal.timeout(config.dify.timeoutMs),
  });
  if (!res.ok) {
    throw new DifyApiError(res.status, undefined, `Dify parameters API エラー (${res.status})`);
  }
  const body = (await res.json()) as { user_input_form?: Record<string, Record<string, unknown>>[] };
  const fields = (body.user_input_form ?? []).map((item) => {
    const [type, def] = Object.entries(item)[0];
    return {
      variable: String(def.variable),
      label: String(def.label ?? def.variable),
      type,
      required: Boolean(def.required),
      options: Array.isArray(def.options) ? def.options.map(String) : undefined,
    };
  });
  parametersCache = { fields, fetchedAt: Date.now() };
  return fields;
}

async function postChatMessage(
  query: string,
  user: string,
  inputs: Record<string, string>,
  conversationId?: string,
): Promise<DifyReply> {
  const res = await fetch(`${config.dify.baseUrl}/chat-messages`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.dify.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      inputs,
      query,
      response_mode: "blocking",
      conversation_id: conversationId ?? "",
      user,
    }),
    signal: AbortSignal.timeout(config.dify.timeoutMs),
  });

  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    throw new DifyApiError(
      res.status,
      body.code as string | undefined,
      `Dify API エラー (${res.status}): ${body.message ?? res.statusText}`,
    );
  }
  return {
    answer: String(body.answer ?? ""),
    conversationId: String(body.conversation_id ?? ""),
  };
}

/**
 * Dify のチャットボット/チャットフローに問い合わせる。
 * 保存済みの conversation_id が Dify 側で無効になっていた場合は、新しい会話として1回だけ再試行する。
 */
export async function askDify(
  query: string,
  user: string,
  inputs: Record<string, string>,
  conversationId?: string,
): Promise<DifyReply> {
  try {
    return await postChatMessage(query, user, inputs, conversationId);
  } catch (err) {
    if (conversationId && err instanceof DifyApiError && err.status === 404) {
      return postChatMessage(query, user, inputs);
    }
    throw err;
  }
}
