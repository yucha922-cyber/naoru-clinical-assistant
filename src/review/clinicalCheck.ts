import { KARTE_FIELDS, type Karte, type KarteKey } from "../domain/karte";
import type { PatientDoc, SelectedExercise } from "../domain/session";
import { splitLines } from "../domain/session";
import { POSTURES, type PostureKey } from "../doc/postures";

// AIが生成したカルテ・患者資料を、施術者が書いた「元メモ」と照合し、確認が必要な箇所を挙げる。
//
// ★ これは「確認のきっかけ」を作るための機械的な照合です。
//   文字列が一致しても医学的に正しいとは限らず、一致しなくても誤りとは限りません。
//   最終的な判断は必ず施術者が行います（画面で「確認済み」にする／修正する）。

export type CheckArea = "karte" | "patient";
export type ClinicalCheck = {
  /** 承認状態の保存に使う識別子（同じ指摘には同じ ID） */
  id: string;
  area: CheckArea;
  severity: "warn" | "info";
  /** 該当する項目の名前（表示用） */
  where: string;
  /** 画面で該当箇所へ移動するためのキー（カルテ項目 or 資料の項目） */
  field: KarteKey | "goal" | "currentPoints" | "idealPoints" | "changes" | "mindItems" | "nextGoal" | "posture" | "selfcare";
  message: string;
};

export type CheckInput = {
  memo: string;
  karte: Karte;
  doc: PatientDoc;
  selections: SelectedExercise[];
  /** 選択中の運動の名称（slug → 名称） */
  selectedTitles: string[];
  /** ライブラリの全運動の名称（指定外の運動の検出用） */
  libraryTitles: string[];
  /** 資料に載る運動の目的（ライブラリの原本または施術者の追記） */
  purposes: { title: string; text: string; fromLibrary: boolean }[];
};

// ---------- 文字の正規化 ----------
const normalize = (s: string): string =>
  s
    .replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
    .replace(/[Ａ-Ｚａ-ｚ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
    .replace(/度/g, "°")
    .replace(/[→⇒➡]/g, "→")
    .replace(/->/g, "→")
    .toLowerCase();

const KARTE_LABEL = Object.fromEntries(KARTE_FIELDS.map((f) => [f.key, f.label])) as Record<KarteKey, string>;

// ---------- ① 数値（ROM・NRS など） ----------
/** メモ中の数値（「45°」「10→4」の 45・10・4 など）を集める */
const numbersIn = (s: string): Set<string> => new Set((normalize(s).match(/\d+(?:\.\d+)?/g) ?? []).map((n) => String(Number(n))));

/** 角度・痛みのスコアなど「実測値」と思われる数値を取り出す */
function measuredValues(s: string): string[] {
  const t = normalize(s);
  const out: string[] = [];
  for (const m of t.matchAll(/(\d+(?:\.\d+)?)\s*°/g)) out.push(m[1]);
  for (const m of t.matchAll(/(?:nrs|vas)\s*[:：]?\s*(\d+(?:\.\d+)?)/g)) out.push(m[1]);
  for (const m of t.matchAll(/(\d+(?:\.\d+)?)\s*\/\s*10\b/g)) out.push(m[1]);
  for (const m of t.matchAll(/(\d+(?:\.\d+)?)\s*→\s*(\d+(?:\.\d+)?)/g)) out.push(m[1], m[2]);
  return [...new Set(out.map((n) => String(Number(n))))];
}

// ---------- ② 検査・施術の名称（英語・日本語の言い換えを同じものとして扱う） ----------
type Term = { name: string; patterns: RegExp[] };
const term = (name: string, ...patterns: (RegExp | string)[]): Term => ({
  name,
  patterns: patterns.map((p) => (typeof p === "string" ? new RegExp(p, "i") : p)),
});

export const EXAM_TERMS: Term[] = [
  term("スパーリングテスト", "スパーリング", "spurling"),
  term("ジャクソンテスト", "ジャクソン", "jackson"),
  term("SLRテスト", "\\bslr\\b", "下肢伸展挙上"),
  term("FNSテスト", "\\bfns\\b", "大腿神経伸展"),
  term("ケンプテスト", "ケンプ", "kemp"),
  term("パトリックテスト", "パトリック", "patrick", "faber"),
  term("トーマステスト", "トーマス", "thomas"),
  term("オーバーテスト", "オーバーテスト", "ober"),
  term("ライトテスト", "ライトテスト", "wright"),
  term("アドソンテスト", "アドソン", "adson"),
  term("ホーキンステスト", "ホーキンス", "hawkins"),
  term("ニアーテスト", "ニアー?テスト", "neer"),
  term("ペインフルアーク", "ペインフルアーク", "painful arc"),
  term("徒手筋力検査", "\\bmmt\\b", "徒手筋力"),
  term("指床間距離", "\\bffd\\b", "指床間"),
  term("握力", "握力"),
  term("片脚立ち", "片脚立", "片足立"),
  term("深部腱反射", "腱反射"),
  term("感覚検査", "感覚検査", "知覚検査"),
  term("圧痛", "圧痛", "押すと痛"),
  term("可動域測定", "\\brom\\b", "可動域", "回旋", "屈曲", "伸展", "外転"),
];

export const TREATMENT_TERMS: Term[] = [
  term("モビライゼーション", "モビライゼーション", "mobiliz"),
  term("マニピュレーション", "マニピュレーション", "manipulat", "スラスト"),
  term("矯正", "矯正"),
  term("リリース", "リリース", "release"),
  term("ストレッチ", "ストレッチ", "stretch"),
  term("マッサージ", "マッサージ", "揉みほぐし"),
  term("徒手療法", "徒手療法", "手技"),
  term("鍼", "鍼", "はり治療"),
  term("電気療法", "電気", "低周波", "ems"),
  term("超音波", "超音波"),
  term("テーピング", "テーピング", "キネシオ", "テープ"),
  term("牽引", "牽引"),
  term("温熱療法", "温熱", "ホットパック"),
  term("アイシング", "アイシング", "冷却"),
  term("トリガーポイント", "トリガーポイント"),
  term("運動療法", "運動療法", "エクササイズ指導", "トレーニング"),
];

// ---------- ③ 姿勢の特徴 ----------
const POSTURE_TERMS: Term[] = [
  term("骨盤の歪み・左右差", /骨盤.{0,6}(歪|ゆがみ|左右差|傾き|傾斜|高さ|ねじれ)/, /歪み/),
  term("側弯", "側弯", "側彎"),
  term("反り腰（腰が反る）", "反り腰", /腰椎.{0,3}前弯/, "骨盤前傾", /腰.{0,3}反/),
  term("猫背（背中が丸い）", "猫背", "円背", /胸椎.{0,3}後弯/, /背中.{0,3}丸/),
  term("巻き肩", "巻き肩", "巻肩", /肩甲骨.{0,4}外転/, /肩.{0,4}前方/),
  term("頭が前に出た姿勢", "ストレートネック", /頭部.{0,3}前方/, "前方頭位", /頭.{0,3}前に出/, /頭が前/),
  term("肩の高さの左右差", /肩.{0,4}(高さ|下が|左右差|挙上)/),
  term("O脚・X脚", "o脚", "x脚"),
  term("扁平足", "扁平足"),
  term("脚長差", "脚長差"),
];

/** 姿勢イラストの種類と、それを裏付けるメモの記載 */
const POSTURE_EVIDENCE: Partial<Record<PostureKey, Term>> = {
  "side-forward-head": POSTURE_TERMS[5],
  "side-rounded-back": POSTURE_TERMS[3],
  "side-sway-back": POSTURE_TERMS[2],
  "front-shoulder-right-low": POSTURE_TERMS[6],
  "front-shoulder-left-low": POSTURE_TERMS[6],
  "front-pelvis-right-low": POSTURE_TERMS[0],
  "front-pelvis-left-low": POSTURE_TERMS[0],
};

// ---------- ④ 断定的な表現 ----------
const ASSERTIONS: { re: RegExp; label: string }[] = [
  { re: /(が|の)原因(です|である|だ|となって|になって|となる|の)|原因は/, label: "原因の断定" },
  { re: /のせいで/, label: "原因の断定" },
  { re: /神経を圧迫/, label: "「神経を圧迫している」" },
  { re: /(完全に|根本的に|根本から)(改善|治|良く)/, label: "効果の断定（完全に・根本的に）" },
  { re: /必ず(改善|治|良く)/, label: "効果の断定（必ず）" },
  { re: /治ります|治る|完治/, label: "「治る」という断定" },
  { re: /歪み.{0,6}(直|治|矯正)/, label: "歪みの改善の断定" },
  { re: /すべての原因|全ての原因/, label: "原因の断定（すべて）" },
];

const has = (text: string, t: Term) => t.patterns.some((p) => p.test(normalize(text)));
const HOPE_MARK = /hope|ホープ|希望|したい|なりたい|ようになりたい|目標|望み/i;
const CHANGE_MARK = /→|->|⇒|施術後|施術直後|直後|前後|変化|改善/;

/** 文字の2文字ずつの組（日本語の近さを大まかに比べる） */
const bigrams = (s: string): Set<string> => {
  const t = normalize(s).replace(/[\s、。・「」（）()!！?？]/g, "");
  const out = new Set<string>();
  for (let i = 0; i < t.length - 1; i++) out.add(t.slice(i, i + 2));
  return out;
};

export function runClinicalChecks(input: CheckInput): ClinicalCheck[] {
  const { memo, karte, doc } = input;
  const checks: ClinicalCheck[] = [];
  const push = (c: Omit<ClinicalCheck, "id">, key: string) => {
    const id = `${c.area}:${c.field}:${key}`;
    if (!checks.some((x) => x.id === id)) checks.push({ ...c, id });
  };
  if (!memo.trim()) return checks;

  // 照合対象の文章
  const karteTexts = (Object.keys(karte) as KarteKey[]).map((k) => ({ key: k, text: karte[k] })).filter((x) => x.text.trim());
  const docTexts: { field: ClinicalCheck["field"]; where: string; text: string }[] = [
    { field: "goal", where: "あなたの目標", text: doc.goal },
    { field: "currentPoints", where: "今のお身体の状態", text: doc.currentPoints },
    { field: "idealPoints", where: "これから目指すお身体の状態", text: doc.idealPoints },
    { field: "changes", where: "今日確認できた変化", text: doc.changes.map((c) => `${c.item} ${c.before}→${c.after}`).join("\n") },
    { field: "mindItems", where: "日常生活で意識すること", text: doc.mindItems.map((m) => m.text).join("\n") },
    { field: "nextGoal", where: "次回来院までの目標", text: `${doc.nextGoal}\n${doc.nextCheck}` },
  ].filter((x) => x.text.trim()) as { field: ClinicalCheck["field"]; where: string; text: string }[];

  // ① 元メモに無い実測値（角度・NRS など）
  // メモの中でも「角度」「→」「NRS」と一緒に書かれた数値（＝実測値）とだけ照合する。
  // ※数値が一致しても、左右・部位の取り違えまでは判定できない（施術者が最終確認する）。
  const allowed = new Set(measuredValues(memo));
  // セルフケアの回数・時間の数字は、セルフケアを書く項目の照合にだけ使う
  const withDosage = new Set(allowed);
  for (const s of input.selections) numbersIn(s.dosage).forEach((n) => withDosage.add(n));
  for (const { key, text } of karteTexts) {
    const ok = key === "currentSelfcare" ? withDosage : allowed;
    for (const v of measuredValues(text)) {
      if (!ok.has(v))
        push({ area: "karte", severity: "warn", where: KARTE_LABEL[key], field: key, message: `数値「${v}」は元メモで確認できません。実測した値か確認してください。` }, `num:${v}`);
    }
  }
  for (const c of doc.changes) {
    for (const v of [...numbersIn(c.before), ...numbersIn(c.after)]) {
      if (!allowed.has(v))
        push({ area: "patient", severity: "warn", where: "今日確認できた変化", field: "changes", message: `数値「${v}」は元メモで確認できません。実測した値か確認してください。` }, `num:${v}`);
    }
  }

  // ② 実施記録の無い検査・施術
  const examFields: KarteKey[] = ["examination", "assessment", "effect", "nextEvaluation"];
  for (const t of EXAM_TERMS) {
    for (const k of examFields) {
      if (karte[k] && has(karte[k], t) && !has(memo, t))
        push({ area: "karte", severity: "warn", where: KARTE_LABEL[k], field: k, message: `検査「${t.name}」は元メモで実施の記録が確認できません。` }, `exam:${t.name}`);
    }
  }
  for (const t of TREATMENT_TERMS) {
    if (karte.treatment && has(karte.treatment, t) && !has(memo, t))
      push({ area: "karte", severity: "warn", where: KARTE_LABEL.treatment, field: "treatment", message: `施術「${t.name}」は元メモで実施の記録が確認できません。` }, `treat:${t.name}`);
  }

  // ③ 評価していない姿勢の特徴
  for (const t of POSTURE_TERMS) {
    if (has(memo, t)) continue;
    for (const { key, text } of karteTexts) {
      if (has(text, t))
        push({ area: "karte", severity: "warn", where: KARTE_LABEL[key], field: key, message: `「${t.name}」の記載がありますが、元メモで評価の記録が確認できません。評価済みの内容か確認してください。` }, `posture:${t.name}`);
    }
    for (const d of docTexts) {
      if (has(d.text, t))
        push({ area: "patient", severity: "warn", where: d.where, field: d.field, message: `「${t.name}」の記載がありますが、元メモで評価の記録が確認できません。評価済みの内容か確認してください。` }, `posture:${t.name}`);
    }
  }
  if (doc.posture) {
    const ev = POSTURE_EVIDENCE[doc.posture];
    if (ev && !has(memo, ev)) {
      const label = POSTURES.find((p) => p.key === doc.posture)?.label ?? doc.posture;
      push({ area: "patient", severity: "warn", where: "姿勢のイラスト", field: "posture", message: `イラスト「${label}」に当たる評価の記録が元メモで確認できません。` }, `figure:${doc.posture}`);
    }
  }

  // ④ 原因・効果の断定
  const assertionTargets = [
    ...karteTexts.map((x) => ({ area: "karte" as const, field: x.key as ClinicalCheck["field"], where: KARTE_LABEL[x.key], text: x.text })),
    ...docTexts.map((x) => ({ area: "patient" as const, ...x })),
  ];
  for (const t of assertionTargets) {
    for (const a of ASSERTIONS) {
      const m = t.text.match(a.re);
      if (m)
        push({ area: t.area, severity: "warn", where: t.where, field: t.field, message: `${a.label}にあたる表現「${m[0]}」があります。根拠が十分か確認し、必要なら言い換えてください。` }, `assert:${a.label}`);
    }
  }
  for (const p of input.purposes) {
    for (const a of ASSERTIONS) {
      const m = p.text.match(a.re);
      if (m)
        push(
          {
            area: "patient",
            severity: "info",
            where: `運動の目的（${p.title}）`,
            field: "selfcare",
            message: `${p.fromLibrary ? "セルフケアライブラリの説明に" : ""}断定的な表現「${m[0]}」があります。必要ならセルフケア選択画面で目的を追記して置き換えてください。`,
          },
          `purpose:${p.title}:${a.label}`,
        );
    }
  }

  // ⑤ 本人が述べていない HOPE
  if (doc.goal.trim()) {
    if (!HOPE_MARK.test(memo)) {
      push({ area: "patient", severity: "warn", where: "あなたの目標", field: "goal", message: "元メモに本人の希望（HOPE）の記載が見つかりません。本人が述べた内容か確認してください。" }, "hope:none");
    } else {
      const g = bigrams(doc.goal);
      const m = bigrams(memo);
      const overlap = g.size ? [...g].filter((x) => m.has(x)).length / g.size : 1;
      if (overlap < 0.4)
        push({ area: "patient", severity: "info", where: "あなたの目標", field: "goal", message: "目標の表現が、元メモの本人の言葉と大きく異なります。本人の希望に沿っているか確認してください。" }, "hope:diff");
    }
  }

  // ⑥ 指定していないセルフケア
  const selected = new Set(input.selectedTitles);
  const mentionTargets = [
    { area: "karte" as const, field: "currentSelfcare" as const, where: KARTE_LABEL.currentSelfcare, text: karte.currentSelfcare },
    { area: "karte" as const, field: "nextPlan" as const, where: KARTE_LABEL.nextPlan, text: karte.nextPlan },
    { area: "patient" as const, field: "nextGoal" as const, where: "次回来院までの目標", text: doc.nextGoal },
    { area: "patient" as const, field: "mindItems" as const, where: "日常生活で意識すること", text: doc.mindItems.map((m) => m.text).join("\n") },
  ];
  for (const t of mentionTargets) {
    if (!t.text.trim()) continue;
    for (const title of input.libraryTitles) {
      if (!selected.has(title) && t.text.includes(title))
        push({ area: t.area, severity: "warn", where: t.where, field: t.field, message: `選択していないセルフケア「${title}」が書かれています。` }, `selfcare:${title}`);
    }
  }

  // ⑦ 施術前後の変化の記録
  if (doc.changes.length > 0 && !CHANGE_MARK.test(memo)) {
    push({ area: "patient", severity: "warn", where: "今日確認できた変化", field: "changes", message: "元メモに施術前後の変化の記録が見つかりません。実際に評価した変化か確認してください。" }, "changes:none");
  }

  // ⑧ カルテと患者資料の食い違い（変化の数値がカルテの【効果】に無い）
  if (doc.changes.length > 0 && karte.effect.trim()) {
    const effectNums = numbersIn(karte.effect);
    const missing = [...new Set(doc.changes.flatMap((c) => [...numbersIn(c.before), ...numbersIn(c.after)]))].filter((n) => !effectNums.has(n));
    if (missing.length)
      push({ area: "patient", severity: "info", where: "今日確認できた変化", field: "changes", message: `資料の数値（${missing.join("、")}）がカルテの【効果】にありません。カルテと資料の内容をそろえてください。` }, `mismatch:${missing.join(",")}`);
  }

  // 「今のお身体の状態」の項目数（資料の読みやすさ）
  if (splitLines(doc.currentPoints).length > 3)
    push({ area: "patient", severity: "info", where: "今のお身体の状態", field: "currentPoints", message: "4項目以上あります。3項目までにすると読みやすくなります。" }, "count:current");

  return checks;
}

/** 元メモに含まれている語か（画面の「元メモと照合」表示用） */
export const memoIncludes = (memo: string, word: string): boolean => normalize(memo).includes(normalize(word));
