import express from "express";
import { middleware, type webhook } from "@line/bot-sdk";
import { config } from "./config.js";
import { handleEvent } from "./handler.js";

const app = express();

app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

// LINE の署名検証。body を自前でパースするため express.json() より前に置く
app.post("/webhook", middleware({ channelSecret: config.line.channelSecret }), (req, res) => {
  const { events } = req.body as webhook.CallbackRequest;

  // Dify の応答を待つと LINE 側の Webhook がタイムアウトするため、先に 200 を返す
  res.sendStatus(200);

  for (const event of events) {
    handleEvent(event).catch((err) => {
      console.error("イベント処理中にエラーが発生しました:", err);
    });
  }
});

app.use((err: Error, _req: express.Request, res: express.Response, next: express.NextFunction) => {
  if (res.headersSent) return next(err);
  // 署名不正(SignatureValidationFailed)など
  console.warn("Webhook リクエストを拒否しました:", err.message);
  res.status(401).json({ error: err.message });
});

app.listen(config.port, () => {
  console.log(`Dify × LINE bot listening on http://localhost:${config.port}`);
  console.log(`Webhook URL: https://<公開URL>/webhook`);
});
