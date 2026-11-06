// NAORU整体 カルテフォーマット（SalonOne へコピーする形式）

export const KARTE_FIELDS = [
  { key: "planFrequency", label: "プラン・頻度" },
  { key: "chiefComplaint", label: "主訴" },
  { key: "secondaryComplaint", label: "副主訴" },
  { key: "presentIllness", label: "現病歴" },
  { key: "reasonForVisit", label: "来院理由" },
  { key: "hope", label: "HOPE・望み" },
  { key: "shortTermGoal", label: "短期目標" },
  { key: "midTermGoal", label: "中期目標" },
  { key: "examination", label: "検査" },
  { key: "assessment", label: "考察・臨床推論" },
  { key: "treatment", label: "施術" },
  { key: "effect", label: "効果" },
  { key: "currentSelfcare", label: "現状のセルフケア項目" },
  { key: "nextEvaluation", label: "次回の評価" },
  { key: "nextPlan", label: "次回の目標・施術内容" },
  { key: "privateWork", label: "最近のプライベート・仕事" },
  { key: "history", label: "既往歴・通院歴" },
  { key: "precautions", label: "注意事項" },
  { key: "review", label: "口コミ" },
  { key: "membershipNotes", label: "入会・備考" },
  { key: "dropoutReason", label: "離反理由" },
] as const;

export type KarteKey = (typeof KARTE_FIELDS)[number]["key"];
export type Karte = Record<KarteKey, string>;

export const KARTE_KEYS: KarteKey[] = KARTE_FIELDS.map((f) => f.key);

export const emptyKarte = (): Karte =>
  Object.fromEntries(KARTE_KEYS.map((k) => [k, ""])) as Karte;

export const isKarteEmpty = (k: Karte): boolean => KARTE_KEYS.every((key) => k[key].trim() === "");

/**
 * SalonOne に貼り付けるテキストを作る。
 * 情報のない項目は省略する（includeEmpty=true なら見出しだけ残す）。
 */
export function formatKarte(karte: Karte, { includeEmpty = false } = {}): string {
  return KARTE_FIELDS.filter((f) => includeEmpty || karte[f.key].trim() !== "")
    .map((f) => `【${f.label}】\n${karte[f.key].trim()}`.trimEnd())
    .join("\n\n");
}
