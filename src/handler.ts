import type { webhook } from "@line/bot-sdk";
import { config } from "./config.js";
import { askDify, getInputFields, type InputField } from "./dify.js";
import { sendText, showLoading } from "./line.js";
import { conversationStore, inputsStore } from "./store.js";

/** LINE のテキストで答えられる入力変数の種類 */
const ASKABLE_TYPES = new Set(["text-input", "paragraph", "number", "select"]);

/** 会話を区別するキー（グループ/ルームではトーク全体で1つの会話にする） */
function chatIdOf(source: webhook.Source | undefined): string | undefined {
  switch (source?.type) {
    case "group":
      return source.groupId;
    case "room":
      return source.roomId;
    case "user":
      return source.userId;
    default:
      return undefined;
  }
}

/** 入力変数の質問文を作る */
function questionFor(field: InputField, index: number, total: number): string {
  const progress = total > 1 ? `（${index + 1}/${total}）` : "";
  if (field.type === "select") {
    return `「${field.label}」を選んでください${progress}`;
  }
  if (field.type === "number") {
    return `「${field.label}」を数字で入力してください${progress}`;
  }
  return `「${field.label}」を入力してください${progress}`;
}

/** 回答が入力変数の形式に合っていればエラーなし(undefined)、合わなければエラー文を返す */
function validate(field: InputField, value: string): string | undefined {
  if (!value) return "空の回答は受け付けられません。";
  if (field.type === "number" && !Number.isFinite(Number(value))) {
    return "数字で入力してください。";
  }
  if (field.type === "select" && field.options && !field.options.includes(value)) {
    return "下の選択肢から選んでください。";
  }
  return undefined;
}

export async function handleEvent(event: webhook.Event): Promise<void> {
  const chatId = chatIdOf(event.source);
  if (!chatId) return;

  if (event.type === "follow") {
    await sendText(event.replyToken, chatId, "友だち追加ありがとうございます！\n何でも気軽に質問してください。");
    return;
  }

  if (event.type !== "message") return;

  if (event.message.type !== "text") {
    await sendText(event.replyToken, chatId, "申し訳ありません、現在はテキストメッセージのみ対応しています。");
    return;
  }

  const text = event.message.text.trim();

  if (config.resetKeywords.includes(text.toLowerCase())) {
    conversationStore.delete(chatId);
    inputsStore.delete(chatId);
    await sendText(event.replyToken, chatId, "会話をリセットしました。新しい話題をどうぞ！");
    return;
  }

  let fields: InputField[];
  try {
    fields = (await getInputFields()).filter((f) => f.required && ASKABLE_TYPES.has(f.type));
  } catch (err) {
    console.error("Dify の入力変数の取得に失敗しました:", err);
    await sendText(event.replyToken, chatId, "エラーが発生しました。時間をおいてもう一度お試しください。");
    return;
  }

  // 必須の入力変数が揃うまで、1つずつ質問する
  const state = inputsStore.get(chatId);
  const missing = fields.filter((f) => !(f.variable in state.inputs));
  let query = text;

  if (missing.length > 0) {
    if (state.pendingQuery === undefined) {
      // 会話の最初のメッセージ：入力変数を聞き終えてから Dify に送る
      state.pendingQuery = text;
    } else {
      const field = missing[0];
      const error = validate(field, text);
      if (error) {
        await sendText(event.replyToken, chatId, `${error}\n${questionFor(field, 0, 1)}`, field.options);
        return;
      }
      state.inputs[field.variable] = text;
      missing.shift();
    }

    if (missing.length > 0) {
      inputsStore.set(chatId, state);
      const next = missing[0];
      const answered = fields.length - missing.length;
      await sendText(event.replyToken, chatId, questionFor(next, answered, fields.length), next.options);
      return;
    }

    query = state.pendingQuery;
    state.pendingQuery = undefined;
    inputsStore.set(chatId, state);
  }

  if (event.source?.type === "user") {
    await showLoading(chatId);
  }

  // Dify の user には発言者のIDを渡す（取得できない場合はトークID）
  const user = event.source?.userId ?? chatId;

  let answer: string;
  try {
    const reply = await askDify(query, user, state.inputs, conversationStore.get(chatId));
    if (reply.conversationId) {
      conversationStore.set(chatId, reply.conversationId);
    }
    answer = reply.answer;
  } catch (err) {
    console.error("Dify への問い合わせに失敗しました:", err);
    answer = "エラーが発生しました。時間をおいてもう一度お試しください。";
  }
  await sendText(event.replyToken, chatId, answer);
}
