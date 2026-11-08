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
4. カルテでは次の4つを区別して書く。①患者の申告（主訴・現病歴・HOPE など「〜と訴える」「〜とのこと」）②検査・観察で確認した事実（検査）③施術者の臨床仮説（考察・臨床推論。「〜の可能性」「〜が疑われる」）④今後の介入提案（次回の評価・目標・施術内容）。
5. 施術後の即時効果と、長期的な改善（目標・見込み）を区別する。
6. 症状の原因や施術効果を断定しない。
7. カルテは医療専門職向けの簡潔な記載にする。
8. 患者向け資料（patient）は、会員さんがパッと見て分かる1枚の資料に載せる。下の「患者向け資料のルール」に従う。カルテの検査結果と矛盾させない。
9. セルフケアは「施術者が選択したセルフケア」に記載されたものだけを扱う。新しい運動を提案・追加しない。
   メモに出てくるが選択リストに無い・特定できない運動は unresolvedExercises に名前だけを書く。
10. 安全上の懸念（レッドフラッグの可能性、禁忌、医療機関受診の検討が必要な所見など）や、メモだけでは判断できない点は confirmations に確認事項として書く。
11. 出力は下記 JSON だけにする。前後に説明文を付けない。コードブロックで囲む場合は \`\`\`json を使う。

# 患者向け資料のルール（patient）
患者さんが「自分の身体の状態が分かった」「なぜセルフケアをするか納得できた」「次回までに何をすればよいか分かった」と感じられる内容にする。
メモに情報が無い項目は推測で埋めず、空（"" または []）にする。
- 医学的な専門用語は原則使わない。ただし医学的な意味を変えない（例:「頸部右回旋制限あり」→「首を右に向ける動きに制限がみられました」、「右肩前方偏位」→「右肩が前方に位置する傾向がみられました」）。
- 次のような断定はしない: 「骨盤の歪みがすべての原因」「筋肉が神経を圧迫している」「姿勢を正せば痛みが治る」「歪みを完全に改善する」「今日の施術で根本的に改善した」。姿勢の特徴と症状の因果関係は、十分な根拠が無い限り断定しない。
- goal（あなたの目標）: 本人が述べた HOPE（希望）を、できるだけ本人の言葉のまま1つ（例:「仕事終わりも肩の重さを気にせず過ごしたい」）。「根本改善」「姿勢改善」のような抽象的な目標を作らない。HOPE がメモに無ければ ""。
- currentPoints（今のお身体の状態）: 問診・身体評価で確認できた特徴を最大3項目（1項目30文字前後）。
- changes（今日確認できた変化）: 施術前後の変化がメモに記録されている場合だけ。item（何の変化か）・before（施術前）・after（施術後）。NRS・角度などの実測値がメモにあれば、その値をそのまま使う。メモに無い角度・痛みのスコアは絶対に作らない。記録が無ければ []。
- idealPoints（これから目指すお身体の状態）: 本人の HOPE に基づく、生活の中での動きや過ごし方の目標を最大3項目（例:「長時間のデスクワーク後も首や肩を楽に動かせる」）。身体を完全に左右対称にすることや、特定の姿勢を保つことだけを目標にしない。
- posture: 姿勢イラストの種類。実際に評価・観察した姿勢がメモにある場合だけ、下の一覧から1つ。評価していなければ null。
- focusAreas: 主訴・評価で不調があった部位を下の一覧から最大3つ。
- pointsToMind（日常生活で意識すること）: 評価内容に合う、具体的に実行できる行動を最大3項目（例:「30〜60分を目安に一度立ち上がる」「スマホを見るときは肘を支える」）。「背筋を常に伸ばす」「首を必ずまっすぐにする」など特定の姿勢を強制する表現は使わない。評価内容に合わないものは書かない。各項目は icon（下の一覧から1つ）と text（30文字前後）。
- selfcare: 選択済みセルフケアごとに、意識するポイントを point に20文字前後で。運動の目的・効果を新たに作らない。
- nextGoal（次回来院までの目標）: 選択済みセルフケアと本人の生活をもとに、自宅で取り組めることを1〜2文（例:「胸筋ストレッチを無理のない範囲で続け、仕事終わりの肩の状態を確かめましょう」）。指定されていない運動・回数を足さない。
- nextCheck（次回確認すること）: カルテの「次回の評価」がメモにあれば、患者さん向けに短く。無ければ ""。

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
      goal: "本人の HOPE（本人の言葉に近い形で。無ければ \"\"）",
      currentPoints: ["今のお身体の状態（30文字前後）", "…最大3項目"],
      changes: [{ item: "何の変化か（例: 首を右に向ける動き）", before: "施術前（メモの値のまま）", after: "施術後（メモの値のまま）" }],
      idealPoints: ["これから目指す状態（生活の中での動き）", "…最大3項目"],
      posture: "side-forward-head（選択肢から1つ、または null）",
      focusAreas: ["neck", "shoulder"],
      pointsToMind: [{ icon: "desk", text: "日常生活で意識すること（30文字前後）" }],
      nextGoal: "次回来院までの目標（1〜2文）",
      nextCheck: "次回確認すること（無ければ \"\"）",
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
