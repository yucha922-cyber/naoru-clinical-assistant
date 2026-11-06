import { buildPrompt, type PromptInput } from "./prompt";
import { parseAIResponse, type ParseResult } from "./parse";

// AI処理を差し替え可能にするためのインターフェース。
//
// 実装済みの Provider:
//   - ManualCopyPasteProvider … ChatGPT / Claude にコピー＆貼り付け（人が仲介）
//   - createLocalProvider()   … このサイト内（ブラウザ内・WebGPU）で動く無料のAI（src/ai/localProvider.ts）
// 将来 API（有料）を使う場合も generate() を実装した Provider を追加する。
// ※ 導入前に費用・患者情報の送信先を必ず確認すること。

export type ProviderMode = "manual-copy-paste" | "api" | "local";

export type GenerateOptions = {
  signal?: AbortSignal;
  /** モデルの読み込み（ダウンロード）進捗 */
  onLoadProgress?: (p: { progress: number; text: string }) => void;
  /** 生成中の進捗（これまでに生成した文字数） */
  onToken?: (chars: number) => void;
};

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
  generate?(input: PromptInput, opts?: GenerateOptions): Promise<string>;
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
