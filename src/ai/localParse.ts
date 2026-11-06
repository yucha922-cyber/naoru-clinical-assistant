import { extractJson } from "./parse";
import { AI_SCHEMA_VERSION } from "./schema";

// サイト内AIの各ステップの出力を、取り込める JSON テキストに整える（純粋関数・テスト対象）。
// Qwen3 は思考モードを切っても出力の先頭に「<think>\n\n</think>\n\n」が付くため、
// そのまま JSON.parse すると失敗する。前後の余計な文字を取り除いてから読む。

export type LocalStep = "patient" | "karte";

export type StepResult =
  | { ok: true; text: string; data: Record<string, unknown> }
  | { ok: false; reason: string; raw: string };

const STEP_LABEL: Record<LocalStep, string> = { patient: "患者資料", karte: "カルテ" };

export function stripThinking(raw: string): string {
  return raw.replace(/<think>[\s\S]*?<\/think>/g, "").replace(/^\s*<\/?think>\s*/g, "").trimStart();
}

export function parseStepOutput(raw: string, step: LocalStep, { truncated = false }: { truncated?: boolean } = {}): StepResult {
  const label = STEP_LABEL[step];
  const body = extractJson(stripThinking(raw));
  let data: unknown = null;
  if (body !== null) {
    try {
      data = JSON.parse(body);
    } catch {
      data = null;
    }
  }
  if (!data || typeof data !== "object") {
    return {
      ok: false,
      raw,
      reason: truncated
        ? `${label}の出力が長くなりすぎて途中で終わりました。施術メモを短くして再度お試しいただくか、「ChatGPT／Claudeにコピー」をお使いください。`
        : `${label}の生成結果を読み取れませんでした。もう一度お試しいただくか、「ChatGPT／Claudeにコピー」をお使いください。`,
    };
  }
  const obj = data as Record<string, unknown>;
  const key = step === "patient" ? "patient" : "karte";
  if (!obj[key] || typeof obj[key] !== "object") {
    return { ok: false, raw, reason: `${label}の生成結果に必要な項目がありませんでした。もう一度お試しください。` };
  }
  // 取り込み用に、もう片方を空にした完全な形にする（反映は該当部分だけ行う）
  const full =
    step === "patient"
      ? { schemaVersion: AI_SCHEMA_VERSION, karte: {}, ...obj }
      : { schemaVersion: AI_SCHEMA_VERSION, patient: { currentPoints: [], idealPoints: [], pointsToMind: [] }, ...obj };
  return { ok: true, text: JSON.stringify(full), data: obj };
}
