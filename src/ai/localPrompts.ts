import { KARTE_FIELDS } from "../domain/karte";
import { BODY_AREAS, MIND_ICONS, POSTURES } from "../doc/postures";
import type { PromptInput } from "./prompt";

// サイト内AI（端末内で動く小さめのモデル）専用の短い指示文。
// AI が読む文字数を減らして速くするため、「患者資料」と「カルテ」の2つに分けている。
// ルールの中身はコピー方式の統合プロンプト（prompt.ts）と同じ。出力形式は JSON スキーマで固定する。
// ※ 患者氏名・担当者名は含めない。

const memoBlock = (input: PromptInput) => `施術メモ:
<<<
${input.memo.trim() || "（未入力）"}
>>>`;

const selfcareBlock = (input: PromptInput, withSlug: boolean) =>
  input.selections.length === 0
    ? "選択済みセルフケア: なし"
    : `選択済みセルフケア:\n${input.selections
        .map(({ selection, exercise }) => `- ${withSlug ? `${exercise.slug}=` : ""}${exercise.title}${selection.dosage ? `（${selection.dosage}）` : ""}`)
        .join("\n")}`;

/** ステップ1: 患者さんに渡す資料（短い箇条書き） */
export function buildLocalPatientPrompt(input: PromptInput): string {
  return `施術メモから、会員さんに渡す説明資料の内容を作る。メモに無い情報は推測せず空（""か[]）にする。
ルール:
- 専門用語は使わず、意味は変えない（例: 頸部右回旋制限→首を右に向ける動きに制限がみられました）。
- 原因を断定しない。「歪みが原因」「神経を圧迫」「根本的に改善した」などは書かない。
- goal: 本人が述べたHOPEを本人の言葉に近い形で。「姿勢改善」など抽象的な目標は作らない。無ければ""。
- currentPoints: 評価で確認できた特徴を最大3つ（30文字前後）。
- changes: 施術前後の変化がメモにある場合だけ。item/before/after。数値はメモの値のまま。無い数値は作らない。
- idealPoints: HOPEに基づく生活の中での目標を最大3つ。左右対称や特定の姿勢を保つことだけを目標にしない。
- posture: 評価した姿勢がメモにある場合だけ1つ。無ければnull。focusAreas: 不調の部位を最大3つ。
- pointsToMind: 評価に合う具体的な行動を最大3つ（iconとtext）。特定の姿勢を強制しない。
- selfcare: 選択済みの運動ごとにpoint（20文字前後）。新しい運動・目的を作らない。
- nextGoal: 次回来院までに自宅で取り組むこと（選択済みの運動だけ）。nextCheck: メモの次回の評価を短く。無ければ""。
- unresolvedExercises: メモにあるが選択済みに無い運動の名前。
posture: ${POSTURES.map((p) => `${p.key}=${p.label.replace(/（.+）/, "")}`).join(", ")}
focusAreas: ${BODY_AREAS.map((a) => `${a.key}=${a.label}`).join(", ")}
icon: ${MIND_ICONS.map((m) => `${m.key}=${m.label}`).join(", ")}
${selfcareBlock(input, true)}
${memoBlock(input)}`;
}

/** ステップ2: 医療専門職向けのカルテ */
export function buildLocalKartePrompt(input: PromptInput): string {
  return `施術メモを整体院のカルテ（医療専門職向け・簡潔）に整理する。
ルール:
- 誤変換は解剖学・運動学の正しい用語に直す。不確かな語は confirmations に書く。
- メモに無い検査・施術・数値を足さない。推測しない。情報が無い項目は""。問診情報を省略しない。
- 主観（本人の申告:主訴・現病歴・HOPE）・客観（検査・観察で確認した事実）・仮説（考察。「〜の可能性」）・今後の介入提案（次回の評価・目標）を分ける。
- 施術直後の効果と長期的な改善を分ける。原因や効果を断定しない。
- currentSelfcare には選択済みセルフケアの名称と回数を書く。
- confirmations: 誤変換の解釈、安全上の懸念（受診を検討すべき所見など）、メモだけでは判断できない点。
項目: ${KARTE_FIELDS.map((f) => `${f.key}=${f.label}`).join(", ")}
${selfcareBlock(input, false)}
${memoBlock(input)}`;
}
