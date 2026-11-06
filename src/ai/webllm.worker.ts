// 端末内AI（WebLLM）を別スレッドで動かすための Web Worker。
// 画面が固まらないよう、モデルの読み込みと文章生成はこのスレッドで行う。
import { WebWorkerMLCEngineHandler } from "@mlc-ai/web-llm";

const handler = new WebWorkerMLCEngineHandler();
self.onmessage = (msg: MessageEvent) => {
  handler.onmessage(msg);
};
