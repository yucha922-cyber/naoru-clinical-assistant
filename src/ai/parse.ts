import { KARTE_KEYS } from "../domain/karte";
import { aiOutputSchema, type AIOutput } from "./schema";

export type ParseResult =
  | { ok: true; value: AIOutput; warnings: string[] }
  | { ok: false; errors: string[] };

/** AIの返答から JSON 部分を取り出す（```json フェンス・前後の説明文に対応） */
export function extractJson(text: string): string | null {
  const fenced = text.match(/```(?:json|JSON)?\s*\n([\s\S]*?)```/);
  if (fenced && fenced[1].includes("{")) return fenced[1].trim();
  const start = text.indexOf("{");
  if (start === -1) return null;
  const end = text.lastIndexOf("}");
  // 閉じかっこが無い＝途中で途切れている可能性。そのまま返して JSON.parse のエラーで知らせる
  return end > start ? text.slice(start, end + 1) : text.slice(start);
}

function describeSyntaxError(json: string, error: unknown): string {
  const msg = error instanceof Error ? error.message : String(error);
  const posMatch = msg.match(/position (\d+)/);
  let where = "";
  if (posMatch) {
    const pos = Number(posMatch[1]);
    const before = json.slice(0, pos);
    const line = before.split("\n").length;
    const col = pos - before.lastIndexOf("\n");
    where = `（${line}行目 ${col}文字目付近）`;
  }
  const opens = (json.match(/[{[]/g) ?? []).length;
  const closes = (json.match(/[}\]]/g) ?? []).length;
  const hint =
    opens > closes
      ? "出力が途中で途切れている可能性があります。AIに「続きを出力して」と依頼するか、もう一度生成してください。"
      : "カンマや引用符（\"）の抜け・余分な文字がないか確認してください。";
  return `JSON の形式が正しくありません${where}。${hint}\n詳細: ${msg}`;
}

const PATH_LABELS: Record<string, string> = {
  karte: "カルテ",
  patient: "患者資料",
  currentState: "① 今のお身体の状態",
  idealState: "② 理想のお身体の状態",
  pointsToMind: "③ 意識していくこと",
  selfcare: "④ セルフケア",
};

/**
 * AIの返答テキストを検証してアプリのデータに変換する。
 * @param selectedSlugs 施術者が選択したセルフケア。これ以外の slug は取り込まない。
 */
export function parseAIResponse(text: string, selectedSlugs: string[]): ParseResult {
  if (text.trim() === "") return { ok: false, errors: ["AIの生成結果が貼り付けられていません。"] };

  const json = extractJson(text);
  if (json === null) {
    return { ok: false, errors: ["JSON（{ から始まるデータ）が見つかりません。AIの返答全体を貼り付けてください。"] };
  }

  let data: unknown;
  try {
    data = JSON.parse(json);
  } catch (e) {
    return { ok: false, errors: [describeSyntaxError(json, e)] };
  }

  const result = aiOutputSchema.safeParse(data);
  if (!result.success) {
    return {
      ok: false,
      errors: result.error.issues.map((issue) => {
        const path = issue.path.map((p) => PATH_LABELS[String(p)] ?? String(p)).join(" › ");
        const what =
          issue.code === "invalid_type" && issue.input === undefined
            ? "が見つかりません"
            : `の形式が正しくありません（${issue.message}）`;
        return `${path || "データ全体"} ${what}`;
      }),
    };
  }

  const warnings: string[] = [];
  const value = result.data;

  const rawKarte = (data as { karte?: Record<string, unknown> }).karte ?? {};
  const unknownKeys = Object.keys(rawKarte).filter((k) => !(KARTE_KEYS as string[]).includes(k));
  if (unknownKeys.length) {
    warnings.push(`カルテの不明な項目は取り込みませんでした: ${unknownKeys.join(", ")}`);
  }

  // 施術者が指定していないセルフケアは取り込まない（AIが勝手に追加した運動を除外）
  const allowed = new Set(selectedSlugs);
  const rejected = value.patient.selfcare.filter((s) => !allowed.has(s.slug));
  if (rejected.length) {
    warnings.push(
      `選択されていないセルフケアは資料に反映しませんでした: ${rejected.map((r) => r.slug).join(", ")}`,
    );
  }
  value.patient.selfcare = value.patient.selfcare.filter((s) => allowed.has(s.slug));

  return { ok: true, value, warnings };
}
