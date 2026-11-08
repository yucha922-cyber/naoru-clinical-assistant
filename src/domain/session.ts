import { emptyKarte, type Karte, type KarteKey } from "./karte";
import type { AIOutput } from "../ai/schema";
import { applyAIOutput, type AIPart } from "./applyAI";
import type { BodyArea, MindIcon, PostureKey } from "../doc/postures";

// 1回の施術（セッション）分の入力データ。
// ★ この状態はブラウザのメモリ上にだけ存在し、localStorage 等には保存しません。
//   ページを閉じる・再読み込みすると消えます。

export type SelectedExercise = {
  slug: string;
  /** 回数・時間（施術者が編集） 例: 左右20秒×2回 */
  dosage: string;
  /** 患者さんへのひとこと（施術者が編集。AI取り込みで空欄のときだけ補完） */
  note: string;
  /**
   * 運動の目的（施術者の追記）。空欄ならセルフケアライブラリの「目的」を使う。
   * ライブラリに目的が無い場合も、AIが自動で作ることはしない。
   */
  purposeNote: string;
};

/** 今日確認できた変化（施術前 → 施術後）。メモに記録がある場合だけ */
export type ChangeItem = { item: string; before: string; after: string };

export type MindItem = { icon: MindIcon; text: string };

/** 患者説明資料（文章ではなく短い箇条書きで持つ） */
export type PatientDoc = {
  /** あなたの目標（本人の HOPE。本人が述べていない目標は作らない。空欄なら「未確認」） */
  goal: string;
  /** 今のお身体の状態（1行1項目・3項目まで） */
  currentPoints: string;
  /** 今日確認できた変化（施術前 → 施術後） */
  changes: ChangeItem[];
  /** これから目指すお身体の状態（1行1項目・3項目まで） */
  idealPoints: string;
  /** 姿勢イラスト（未選択なら null） */
  posture: PostureKey | null;
  /** イラストに印を付ける部位 */
  focusAreas: BodyArea[];
  /** 日常生活で意識すること */
  mindItems: MindItem[];
  /** 次回来院までの目標 */
  nextGoal: string;
  /** 次回確認すること（次回の評価項目を短く） */
  nextCheck: string;
};

export const emptyPatientDoc = (): PatientDoc => ({
  goal: "",
  currentPoints: "",
  changes: [],
  idealPoints: "",
  posture: null,
  focusAreas: [],
  mindItems: [],
  nextGoal: "",
  nextCheck: "",
});

export type SessionMeta = {
  visitDate: string;
  therapistName: string;
  /** 資料表示用。AIへ渡すプロンプトには含めない */
  patientName: string;
};

export type Session = {
  meta: SessionMeta;
  memo: string;
  selections: SelectedExercise[];
  /** ライブラリで特定できない運動（確認待ち）。患者資料には載せない */
  pendingExercises: string[];
  karte: Karte;
  patientDoc: PatientDoc;
  /** AIが挙げた確認事項・安全上の懸念 */
  confirmations: string[];
};

const today = () => {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

export const emptySession = (): Session => ({
  meta: { visitDate: today(), therapistName: "", patientName: "" },
  memo: "",
  selections: [],
  pendingExercises: [],
  karte: emptyKarte(),
  patientDoc: emptyPatientDoc(),
  confirmations: [],
});

export type SessionAction =
  | { type: "replace"; session: Session }
  | { type: "setMeta"; patch: Partial<SessionMeta> }
  | { type: "setMemo"; memo: string }
  | { type: "appendMemo"; text: string }
  | { type: "toggleExercise"; slug: string; defaultDosage: string }
  | { type: "updateSelection"; slug: string; patch: Partial<Omit<SelectedExercise, "slug">> }
  | { type: "moveSelection"; slug: string; delta: -1 | 1 }
  | { type: "removeSelection"; slug: string }
  | { type: "addPending"; name: string }
  | { type: "removePending"; name: string }
  | { type: "setKarteField"; key: KarteKey; value: string }
  | { type: "setPatientDoc"; patch: Partial<PatientDoc> }
  | { type: "setConfirmations"; items: string[] }
  /** AIの出力を「その時点の最新の状態」に反映する（生成中に編集された内容を失わないため） */
  | { type: "applyAI"; output: AIOutput; parts?: AIPart[] };

export function sessionReducer(state: Session, action: SessionAction): Session {
  switch (action.type) {
    case "replace":
      return action.session;
    case "setMeta":
      return { ...state, meta: { ...state.meta, ...action.patch } };
    case "setMemo":
      return { ...state, memo: action.memo };
    case "appendMemo": {
      const sep = state.memo === "" || state.memo.endsWith("\n") ? "" : "\n";
      return { ...state, memo: state.memo + sep + action.text };
    }
    case "toggleExercise": {
      const exists = state.selections.some((s) => s.slug === action.slug);
      return {
        ...state,
        selections: exists
          ? state.selections.filter((s) => s.slug !== action.slug)
          : [...state.selections, { slug: action.slug, dosage: action.defaultDosage, note: "", purposeNote: "" }],
      };
    }
    case "updateSelection":
      return {
        ...state,
        selections: state.selections.map((s) => (s.slug === action.slug ? { ...s, ...action.patch } : s)),
      };
    case "moveSelection": {
      const i = state.selections.findIndex((s) => s.slug === action.slug);
      const j = i + action.delta;
      if (i < 0 || j < 0 || j >= state.selections.length) return state;
      const next = [...state.selections];
      [next[i], next[j]] = [next[j], next[i]];
      return { ...state, selections: next };
    }
    case "removeSelection":
      return { ...state, selections: state.selections.filter((s) => s.slug !== action.slug) };
    case "addPending": {
      const name = action.name.trim();
      if (!name || state.pendingExercises.includes(name)) return state;
      return { ...state, pendingExercises: [...state.pendingExercises, name] };
    }
    case "removePending":
      return { ...state, pendingExercises: state.pendingExercises.filter((n) => n !== action.name) };
    case "setKarteField":
      return { ...state, karte: { ...state.karte, [action.key]: action.value } };
    case "setPatientDoc":
      return { ...state, patientDoc: { ...state.patientDoc, ...action.patch } };
    case "setConfirmations":
      return { ...state, confirmations: action.items };
    case "applyAI":
      return applyAIOutput(state, action.output, action.parts);
  }
}

/** 入力が1つでもあるか（ページを閉じるときの警告に使う） */
export function hasUserInput(s: Session): boolean {
  return (
    s.memo.trim() !== "" ||
    s.meta.patientName.trim() !== "" ||
    s.selections.length > 0 ||
    s.pendingExercises.length > 0 ||
    Object.values(s.karte).some((v) => v.trim() !== "") ||
    s.patientDoc.goal.trim() !== "" ||
    s.patientDoc.currentPoints.trim() !== "" ||
    s.patientDoc.idealPoints.trim() !== "" ||
    s.patientDoc.mindItems.length > 0
  );
}

/** 「③ 意識していくこと」を1行1項目のリストにする */
export const splitLines = (text: string): string[] =>
  text
    .split("\n")
    .map((l) => l.replace(/^\s*(?:[-*・●○]|\d+[.)．、])\s*/, "").trim())
    .filter(Boolean);
