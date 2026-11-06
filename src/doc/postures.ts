// 患者資料のイラスト（姿勢のタイプ・気になる部位・意識することのアイコン）の定義。
// AIの出力・施術者の選択はこの一覧のキーで指定する。

export const POSTURES = [
  { key: "side-forward-head", label: "頭が前に出ている（横から）", view: "side" },
  { key: "side-rounded-back", label: "背中が丸い（横から）", view: "side" },
  { key: "side-sway-back", label: "腰が反っている（横から）", view: "side" },
  { key: "side-neutral", label: "特に姿勢の崩れなし（横から）", view: "side" },
  { key: "front-shoulder-right-low", label: "右肩が下がっている（正面）", view: "front" },
  { key: "front-shoulder-left-low", label: "左肩が下がっている（正面）", view: "front" },
  { key: "front-pelvis-right-low", label: "骨盤の右側が下がっている（正面）", view: "front" },
  { key: "front-pelvis-left-low", label: "骨盤の左側が下がっている（正面）", view: "front" },
  { key: "front-neutral", label: "特に左右差なし（正面）", view: "front" },
] as const;

export type PostureKey = (typeof POSTURES)[number]["key"];
export const POSTURE_KEYS = POSTURES.map((p) => p.key) as [PostureKey, ...PostureKey[]];

/** 「理想」側に描く姿勢（同じ向きのまっすぐな姿勢） */
export const idealOf = (key: PostureKey): PostureKey =>
  POSTURES.find((p) => p.key === key)?.view === "front" ? "front-neutral" : "side-neutral";

export const BODY_AREAS = [
  { key: "head", label: "頭" },
  { key: "neck", label: "首" },
  { key: "shoulder", label: "肩" },
  { key: "upperBack", label: "背中" },
  { key: "lowerBack", label: "腰" },
  { key: "pelvis", label: "骨盤・お尻" },
  { key: "hip", label: "股関節" },
  { key: "knee", label: "ひざ" },
  { key: "ankle", label: "足首・足" },
] as const;

export type BodyArea = (typeof BODY_AREAS)[number]["key"];
export const BODY_AREA_KEYS = BODY_AREAS.map((a) => a.key) as [BodyArea, ...BodyArea[]];

export const MIND_ICONS = [
  { key: "desk", label: "パソコン・デスクワーク" },
  { key: "break", label: "こまめな休憩" },
  { key: "phone", label: "スマホ" },
  { key: "sit", label: "座り方" },
  { key: "stand", label: "立ち方・歩き方" },
  { key: "lift", label: "物の持ち方" },
  { key: "sleep", label: "睡眠・寝る姿勢" },
  { key: "bath", label: "入浴・温める" },
  { key: "water", label: "水分" },
  { key: "breath", label: "呼吸・リラックス" },
  { key: "walk", label: "運動・ウォーキング" },
  { key: "shoes", label: "靴" },
  { key: "check", label: "その他" },
] as const;

export type MindIcon = (typeof MIND_ICONS)[number]["key"];
export const MIND_ICON_KEYS = MIND_ICONS.map((m) => m.key) as [MindIcon, ...MindIcon[]];

/** 文章からアイコンを推測する（AIがアイコンを指定しなかったとき・手入力時の初期値） */
export function guessMindIcon(text: string): MindIcon {
  const rules: [RegExp, MindIcon][] = [
    [/パソコン|PC|デスク|画面|モニター|仕事/, "desk"],
    [/休憩|合間|時間ごと|1時間/, "break"],
    [/スマホ|携帯/, "phone"],
    [/座/, "sit"],
    [/寝|睡眠|枕/, "sleep"],
    [/お風呂|入浴|湯船|温め/, "bath"],
    [/水分|水を/, "water"],
    [/呼吸|深呼吸|リラックス/, "breath"],
    [/持ち|荷物|抱っこ|かばん|バッグ/, "lift"],
    [/靴|ヒール/, "shoes"],
    [/歩|ウォーキング|運動/, "walk"],
    [/立/, "stand"],
  ];
  return rules.find(([re]) => re.test(text))?.[1] ?? "check";
}
