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
  return `施術メモから、会員さんに渡すA4 1枚の資料の内容を作る。
ルール:
- 専門用語は使わない。短い箇条書き（1項目25文字前後）。
- 原因を断定しない（「〜しやすい」「〜の傾向」）。メモに無いことは書かない。
- goal: 本人の希望をもとに20文字以内。無ければ""。
- currentPoints: 今の状態を最大3つ。idealPoints: 目指す状態を最大3つ（currentPointsと同じ順に対応）。
- posture: メモから明らかな姿勢を1つ。判断できなければnull。
- focusAreas: 不調の部位を最大3つ。
- pointsToMind: 日常で気をつけることを最大3つ（iconとtext）。
- selfcare: 選択済みの運動ごとにpoint（20文字前後）。新しい運動は書かない。
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
- 主観（本人の申告）・客観（検査・観察）・仮説を分ける。仮説は「〜の可能性」。
- 施術直後の効果と長期的な改善を分ける。原因や効果を断定しない。
- currentSelfcare には選択済みセルフケアの名称と回数を書く。
- confirmations: 誤変換の解釈、安全上の懸念（受診を検討すべき所見など）、メモだけでは判断できない点。
項目: ${KARTE_FIELDS.map((f) => `${f.key}=${f.label}`).join(", ")}
${selfcareBlock(input, false)}
${memoBlock(input)}`;
}
