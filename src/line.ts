import { messagingApi } from "@line/bot-sdk";
import { config } from "./config.js";

const client = new messagingApi.MessagingApiClient({
  channelAccessToken: config.line.channelAccessToken,
});

const MAX_TEXT_LENGTH = 5000;
const MAX_MESSAGES = 5;

/** LINEの上限（1通5000文字・1回5通）に合わせてテキストを分割する */
function toTextMessages(text: string): messagingApi.TextMessage[] {
  const chars = Array.from(text.trim() || "（回答が空でした）");
  const chunks: string[] = [];
  for (let i = 0; i < chars.length && chunks.length < MAX_MESSAGES; i += MAX_TEXT_LENGTH) {
    chunks.push(chars.slice(i, i + MAX_TEXT_LENGTH).join(""));
  }
  return chunks.map((chunk) => ({ type: "text", text: chunk }));
}

/** 選択肢をクイックリプライ（タップで送信できるボタン）にする。ラベル20文字・13個まで */
function toQuickReply(choices: string[]): messagingApi.QuickReply {
  return {
    items: choices.slice(0, 13).map((choice) => ({
      type: "action",
      action: { type: "message", label: Array.from(choice).slice(0, 20).join(""), text: choice },
    })),
  };
}

/** 「入力中」のローディング表示（1対1トークのみ対応。失敗しても処理は続行） */
export async function showLoading(userId: string): Promise<void> {
  try {
    await client.showLoadingAnimation({ chatId: userId, loadingSeconds: 60 });
  } catch (err) {
    console.warn("ローディング表示に失敗しました:", err);
  }
}

/**
 * replyToken で返信し、期限切れ等で失敗した場合は push メッセージで送り直す。
 * （push はメッセージ通数の課金対象になる点に注意）
 */
export async function sendText(
  replyToken: string | undefined,
  to: string | undefined,
  text: string,
  choices?: string[],
): Promise<void> {
  const messages = toTextMessages(text);
  if (choices?.length) {
    messages[messages.length - 1].quickReply = toQuickReply(choices);
  }
  if (replyToken) {
    try {
      await client.replyMessage({ replyToken, messages });
      return;
    } catch (err) {
      if (!to) throw err;
      console.warn("reply に失敗したため push で送信します:", err);
    }
  }
  if (!to) throw new Error("送信先がありません");
  await client.pushMessage({ to, messages });
}
