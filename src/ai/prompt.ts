import { KARTE_FIELDS } from "../domain/karte";
import type { SelectedExercise, SessionMeta } from "../domain/session";
import type { Exercise } from "../data/selfcare";
import { AI_SCHEMA_VERSION } from "./schema";

export type PromptInput = {
  meta: Pick<SessionMeta, "visitDate">;
  memo: string;
  selections: { selection: SelectedExercise; exercise: Exercise }[];
  pendingExercises: string[];
};

// 統合プロンプト。ChatGPT / Claude どちらに貼り付けても同じ結果形式になるようにしている。
// ※ 患者氏名・担当者名はプロンプトに含めない（外部AIに個人を特定できる情報を渡さないため）。

const RULES = `あなたは臨床経験豊富な理学療法士です。整体院「NAORU整体」のセラピストが書いた施術メモを整理し、
(1) 医療専門職向けのカルテ と (2) 患者さん向け説明資料の文章 を同時に作成してください。

# 必ず守るルール
1. 解剖学・運動学・臨床推論の正確性を重視する。音声入力の誤変換は文脈から適切な専門用語に修正する（例:「ちょうようきん」→「腸腰筋」）。修正が確実でない語は confirmations に挙げる。
2. 問診情報を勝手に省略しない。
3. メモに書かれていない検査・施術・測定値を追加しない。不明な情報を推測で補完しない。情報のない項目は空文字 "" にする。
4. 患者の申告（主観）、測定・観察した事実（客観）、臨床仮説 を区別して書く。仮説は「〜の可能性」「〜が疑われる」と表現する。
5. 施術後の即時効果と、長期的な改善（目標・見込み）を区別する。
6. 症状の原因や施術効果を断定しない。
7. カルテは医療専門職向けの簡潔な記載にする。
8. 患者向け文章は専門用語をできるだけ使わず、短くわかりやすい日本語にする。カルテの検査結果と矛盾させない。
9. セルフケアは「施術者が選択したセルフケア」に記載されたものだけを扱う。新しい運動を提案・追加しない。
   メモに出てくるが選択リストに無い・特定できない運動は unresolvedExercises に名前だけを書く。
10. 安全上の懸念（レッドフラッグの可能性、禁忌、医療機関受診の検討が必要な所見など）や、メモだけでは判断できない点は confirmations に確認事項として書く。
11. 出力は下記 JSON だけにする。前後に説明文を付けない。コードブロックで囲む場合は \`\`\`json を使う。`;

function schemaExample(slugs: string[]): string {
  const karte = Object.fromEntries(KARTE_FIELDS.map((f) => [f.key, `（${f.label}）`]));
  const example = {
    schemaVersion: AI_SCHEMA_VERSION,
    karte,
    patient: {
      currentState: "① 今のお身体の状態（患者さん向け・2〜4文）",
      idealState: "② 理想のお身体の状態（本人のHOPEを優先・2〜3文）",
      pointsToMind: ["③ 意識していくこと（1項目1文・3〜5項目）"],
      selfcare: (slugs.length ? slugs : ["（選択されたセルフケアの slug）"]).map((slug) => ({
        slug,
        point: "このセルフケアで意識するポイント（患者さん向け・1文）",
      })),
    },
    unresolvedExercises: [],
    confirmations: [],
  };
  return JSON.stringify(example, null, 2);
}

export function buildPrompt(input: PromptInput): string {
  const fieldList = KARTE_FIELDS.map((f) => `- ${f.key}: 【${f.label}】`).join("\n");

  const selfcare =
    input.selections.length === 0
      ? "（選択なし。patient.selfcare は空配列 [] にする）"
      : input.selections
          .map(({ selection, exercise }, i) => {
            const lines = [
              `${i + 1}. slug: ${exercise.slug} ／ 名称: ${exercise.title}`,
              exercise.purpose ? `   目的: ${exercise.purpose}` : null,
              selection.dosage ? `   回数・時間: ${selection.dosage}` : null,
              selection.note ? `   施術者メモ: ${selection.note}` : null,
            ];
            return lines.filter(Boolean).join("\n");
          })
          .join("\n");

  const pending = input.pendingExercises.length
    ? `\n# 確認待ちの運動（ライブラリで未特定。資料には載せない）\n${input.pendingExercises.map((p) => `- ${p}`).join("\n")}\n`
    : "";

  return `${RULES}

# カルテ項目（karte のキーと見出しの対応）
${fieldList}
「currentSelfcare（現状のセルフケア項目）」には、下記の選択済みセルフケアの名称と回数・時間を書く。

# 施術者が選択したセルフケア
${selfcare}
${pending}
# 出力形式（この JSON の形で、値だけを書き換えて出力）
${schemaExample(input.selections.map((s) => s.exercise.slug))}

# 施術日
${input.meta.visitDate || "（未入力）"}

# 施術メモ（問診・評価・施術内容）
<<<施術メモ ここから>>>
${input.memo.trim() || "（未入力）"}
<<<施術メモ ここまで>>>
`;
}

/** 外部AIに貼り付ける前の注意点チェック（個人情報が含まれていそうな箇所） */
export function findPrivacyWarnings(memo: string, patientName: string): string[] {
  const warnings: string[] = [];
  const name = patientName.trim();
  if (name.length >= 2 && memo.includes(name)) {
    warnings.push("施術メモに患者様のお名前が含まれています。外部AIに貼り付ける前に削除してください。");
  }
  if (/0\d{1,4}-?\d{1,4}-?\d{3,4}/.test(memo)) {
    warnings.push("電話番号のような数字が含まれています。");
  }
  if (/[\w.+-]+@[\w-]+\.[\w.]+/.test(memo)) {
    warnings.push("メールアドレスが含まれています。");
  }
  if (/(?:東京都|北海道|大阪府|京都府|.{2,3}県).{1,8}[市区町村]/.test(memo)) {
    warnings.push("住所のような記載が含まれています。");
  }
  return warnings;
}
