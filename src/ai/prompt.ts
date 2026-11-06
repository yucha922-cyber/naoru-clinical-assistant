import { KARTE_FIELDS } from "../domain/karte";
import type { SelectedExercise, SessionMeta } from "../domain/session";
import type { Exercise } from "../data/selfcare";
import { AI_SCHEMA_VERSION } from "./schema";
import { BODY_AREAS, MIND_ICONS, POSTURES } from "../doc/postures";

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
8. 患者向け資料（patient）は、会員さんがパッと見て分かる1枚の資料に載せる。下の「患者向け資料のルール」に従う。カルテの検査結果と矛盾させない。
9. セルフケアは「施術者が選択したセルフケア」に記載されたものだけを扱う。新しい運動を提案・追加しない。
   メモに出てくるが選択リストに無い・特定できない運動は unresolvedExercises に名前だけを書く。
10. 安全上の懸念（レッドフラッグの可能性、禁忌、医療機関受診の検討が必要な所見など）や、メモだけでは判断できない点は confirmations に確認事項として書く。
11. 出力は下記 JSON だけにする。前後に説明文を付けない。コードブロックで囲む場合は \`\`\`json を使う。

# 患者向け資料のルール（patient）
- 医学的な専門用語は原則使わない（例: 胸鎖乳突筋→首の前の筋肉、胸椎→背中の上のほう、可動域→動かせる範囲）。
- 文章ではなく、短い箇条書きにする。1項目は25文字前後まで。
- goal: 本人の HOPE をもとにした目標を20文字以内で1つ（例:「仕事のあとも肩を気にせず過ごす」）。HOPE が無ければ ""。
- currentPoints（① 今のお身体の状態）: 検査で分かった身体の特徴や不調を最大3項目。原因は断定せず「〜しやすい状態」「〜の傾向」と書く。
- idealPoints（② 理想のお身体の状態）: 改善後に目指す姿勢・動き・生活を最大3項目。できるだけ currentPoints と同じ順番で対応させ、今との違いが分かるようにする。HOPE を優先する。
- posture: 姿勢イラストの種類。検査・観察の記載から明らかに当てはまるものを下の一覧から1つ選ぶ。当てはまらない・判断できない場合は null。
- focusAreas: 主訴・検査で不調があった部位を下の一覧から最大3つ。
- pointsToMind（③ 意識していくこと）: 日常生活・仕事・姿勢・動作で気をつけることを3項目まで。各項目は icon（下の一覧から1つ）と text（25文字前後）。
- selfcare: 選択済みセルフケアごとに、意識するポイントを point に20文字前後で。

# posture の選択肢
${POSTURES.map((p) => `- ${p.key}: ${p.label}`).join("\n")}

# focusAreas の選択肢
${BODY_AREAS.map((a) => `- ${a.key}: ${a.label}`).join("\n")}

# pointsToMind の icon の選択肢
${MIND_ICONS.map((m) => `- ${m.key}: ${m.label}`).join("\n")}`;

function schemaExample(slugs: string[]): string {
  const karte = Object.fromEntries(KARTE_FIELDS.map((f) => [f.key, `（${f.label}）`]));
  const example = {
    schemaVersion: AI_SCHEMA_VERSION,
    karte,
    patient: {
      goal: "目標（20文字以内）",
      currentPoints: ["① 今の状態（25文字前後）", "…最大3項目"],
      idealPoints: ["② 理想の状態（①と対応させる）", "…最大3項目"],
      posture: "side-forward-head（選択肢から1つ、または null）",
      focusAreas: ["neck", "shoulder"],
      pointsToMind: [{ icon: "desk", text: "③ 意識すること（25文字前後）" }],
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

export function buildPrompt(input: PromptInput, { includeExample = true }: { includeExample?: boolean } = {}): string {
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
${
    includeExample
      ? `# 出力形式（この JSON の形で、値だけを書き換えて出力）\n${schemaExample(input.selections.map((s) => s.exercise.slug))}\n`
      : `# 出力形式\n指定された JSON スキーマに従って出力する。karte の各項目は日本語の文章。patient は「患者向け資料のルール」に従った短い箇条書き。patient.selfcare は選択済みセルフケアごとに1件。\n`
  }
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
