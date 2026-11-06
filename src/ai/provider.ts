import { buildPrompt, type PromptInput } from "./prompt";
import { parseAIResponse, type ParseResult } from "./parse";

// AI処理を差し替え可能にするためのインターフェース。
//
// 初期版は「コピー＆貼り付け」方式（ManualCopyPasteProvider）だけを実装しています。
// 将来 API（有料）やローカルAI（Ollama 等）を使う場合は、generate() を実装した Provider を
// 追加し、UI側で選べるようにします。※ 導入前に費用・患者情報の送信先を必ず確認すること。

export type ProviderMode = "manual-copy-paste" | "api" | "local";

export interface ClinicalAIProvider {
  readonly id: string;
  readonly label: string;
  readonly mode: ProviderMode;
  /** AIに渡す入力（プロンプト）を作る */
  buildRequest(input: PromptInput): string;
  /**
   * 自動生成できる Provider だけが実装する。返り値はAIの生テキスト。
   * manual-copy-paste では未実装（人がAIに貼り付けて結果を貼り戻す）。
   */
  generate?(input: PromptInput, signal?: AbortSignal): Promise<string>;
  /** AIの生テキストを検証して取り込める形にする */
  parseResponse(text: string, selectedSlugs: string[]): ParseResult;
}

export const ManualCopyPasteProvider: ClinicalAIProvider = {
  id: "manual-copy-paste",
  label: "ChatGPT / Claude にコピー＆貼り付け",
  mode: "manual-copy-paste",
  buildRequest: buildPrompt,
  parseResponse: parseAIResponse,
};

export const DEFAULT_PROVIDER = ManualCopyPasteProvider;
