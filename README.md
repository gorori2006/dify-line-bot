# Dify × LINE チャットボット連携

Dify で作成したチャットボット（チャットボット / チャットフロー）を LINE 公式アカウントで使えるようにする中継サーバーです。

```
LINE ユーザー → LINE Platform → (HTTPS) → 本サーバー /webhook → Dify /chat-messages
                                     ← 返信（reply、失敗時は push） ←
```

## 機能
- LINE のテキストメッセージを Dify に送り、回答を LINE に返信
- LINE のトーク（ユーザー / グループ / ルーム）ごとに Dify の `conversation_id` を SQLite に保存し、文脈を引き継ぐ（再起動しても会話は続きます）
- 「リセット」/「reset」と送ると新しい会話を開始
- 回答を待つ間は「入力中」アニメーションを表示（1対1トークのみ）
- 5000文字を超える回答は分割して送信（最大5通）
- Webhook の署名検証（`x-line-signature`）

## 必要なもの
- Node.js 22.13 以上（組み込みの `node:sqlite` を使用）
- LINE Developers アカウント
- Dify アプリ（チャットボット または チャットフロー）
- [ngrok](https://ngrok.com/) など、ローカルを HTTPS で公開するツール

## セットアップ

### 1. LINE の設定
1. [LINE Developers コンソール](https://developers.line.biz/console/) でプロバイダーを作成し、**Messaging API チャネル**を作成
2. 「チャネル基本設定」タブの **チャネルシークレット** を控える
3. 「Messaging API設定」タブで **チャネルアクセストークン（長期）** を発行して控える
4. 同じタブの「LINE公式アカウント機能」から LINE Official Account Manager を開き、
   - 応答メッセージ：**オフ**
   - Webhook：**オン**

### 2. Dify の設定
1. Dify でチャットボット / チャットフローアプリを作成し、**公開**する
2. アプリの「APIアクセス」から **API キー**（`app-...`）を発行する
3. API サーバーの URL を確認する（Dify Cloud なら `https://api.dify.ai/v1`）

> 開始時に入力が必須の変数（inputs）を設定している場合、このサーバーは `inputs: {}` を送るためエラーになります。変数は任意にするか、`src/dify.ts` で値を渡してください。

### 3. サーバーの起動
```bash
npm install
cp .env.example .env   # 値を記入
npm run dev            # 開発用（ファイル変更で自動再起動）
```
本番用は `npm run build && npm start` です。

### 4. Webhook の設定
```bash
ngrok http 3000
```
表示された `https://xxxx.ngrok-free.app` に `/webhook` を付けた URL を、LINE Developers の「Messaging API設定」→ **Webhook URL** に設定し、「検証」で成功することを確認します。「Webhookの利用」もオンにしてください。

あとは LINE 公式アカウントを友だち追加して話しかければ、Dify の回答が返ってきます。

## Render にデプロイする（常時公開）
1. [Render](https://render.com/) に GitHub アカウントでログイン
2. ダッシュボードで **New > Blueprint** を選び、このリポジトリを接続（`render.yaml` が読み込まれる）
3. `LINE_CHANNEL_SECRET` / `LINE_CHANNEL_ACCESS_TOKEN` / `DIFY_API_KEY` を入力して **Apply**（セルフホストの Dify なら `DIFY_BASE_URL` も変更）
4. デプロイ完了後に表示される `https://dify-line-bot-xxxx.onrender.com` に `/webhook` を付けて、LINE の Webhook URL に設定

無料プランの注意点：
- 15分間リクエストがないと休止し、次のメッセージへの返事に30〜60秒ほどかかります（reply の期限を過ぎた場合は push で返信します）
- ディスクが保存されないため、休止・再デプロイのたびに会話履歴と入力変数がリセットされます

## 環境変数
| 変数 | 必須 | 説明 |
|---|---|---|
| `LINE_CHANNEL_SECRET` | ✔ | LINE チャネルシークレット |
| `LINE_CHANNEL_ACCESS_TOKEN` | ✔ | LINE チャネルアクセストークン（長期） |
| `DIFY_API_KEY` | ✔ | Dify アプリの API キー |
| `DIFY_BASE_URL` | | 既定 `https://api.dify.ai/v1`。セルフホストは `http://<host>/v1` |
| `DIFY_TIMEOUT_MS` | | Dify 応答のタイムアウト（既定 90000） |
| `PORT` | | 既定 `3000` |
| `DB_PATH` | | 既定 `./data/conversations.db` |
| `RESET_KEYWORDS` | | 既定 `リセット,reset`（カンマ区切り） |

## ファイル構成
| ファイル | 役割 |
|---|---|
| `src/index.ts` | Express サーバー、`/webhook`・`/health` |
| `src/handler.ts` | LINE イベントの処理 |
| `src/dify.ts` | Dify `/chat-messages` の呼び出し |
| `src/line.ts` | LINE への返信・ローディング表示 |
| `src/store.ts` | 会話 ID の保存（SQLite） |
| `src/config.ts` | 環境変数の読み込み |

## 注意点
- reply トークンの有効期限（約1分）を過ぎて Dify の回答が返った場合は push メッセージで送ります。push は月間の無料メッセージ通数に含まれます。
- ngrok の無料プランは起動するたびに URL が変わるため、そのつど Webhook URL を更新してください。

## ライセンス
[MIT License](LICENSE)
