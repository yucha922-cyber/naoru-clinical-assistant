import type { KarteKey } from "./karte";

// カルテ項目の情報の種類。施術者が「患者の申告」「検査で確認した事実」「臨床仮説」「今後の提案」を
// 取り違えないよう、カルテ確認画面で各項目に表示する。

export type KarteCategory = "report" | "fact" | "done" | "hypothesis" | "plan";

export const KARTE_CATEGORY: Partial<Record<KarteKey, KarteCategory>> = {
  chiefComplaint: "report",
  secondaryComplaint: "report",
  presentIllness: "report",
  reasonForVisit: "report",
  hope: "report",
  privateWork: "report",
  history: "report",
  examination: "fact",
  effect: "fact",
  treatment: "done",
  assessment: "hypothesis",
  planFrequency: "plan",
  shortTermGoal: "plan",
  midTermGoal: "plan",
  nextEvaluation: "plan",
  nextPlan: "plan",
};

export const CATEGORY_STYLE: Record<KarteCategory, { label: string; hint: string; className: string }> = {
  report: { label: "患者の申告", hint: "本人が話した内容（主観）", className: "bg-sec-pink-bg text-sec-pink" },
  fact: { label: "検査で確認した事実", hint: "検査・観察・測定で確認した内容（客観）", className: "bg-sec-blue-bg text-sec-blue" },
  done: { label: "実施した施術", hint: "実際に行った施術の記録", className: "bg-navy-100 text-navy-800" },
  hypothesis: { label: "臨床仮説", hint: "施術者の考え（「〜の可能性」）。断定しない", className: "bg-amber-100 text-amber-800" },
  plan: { label: "今後の提案", hint: "今後の目標・評価・介入の予定", className: "bg-sec-green-bg text-sec-green" },
};
