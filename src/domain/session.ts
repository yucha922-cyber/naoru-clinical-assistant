import { emptyKarte, type Karte, type KarteKey } from "./karte";
import type { AIOutput } from "../ai/schema";
import { applyAIOutput } from "./applyAI";

// 1回の施術（セッション）分の入力データ。
// ★ この状態はブラウザのメモリ上にだけ存在し、localStorage 等には保存しません。
//   ページを閉じる・再読み込みすると消えます。

export type SelectedExercise = {
  slug: string;
  /** 回数・時間（施術者が編集） 例: 左右20秒×2回 */
  dosage: string;
  /** 患者さんへのひとこと（施術者が編集。AI取り込みで空欄のときだけ補完） */
  note: string;
};

export type PatientDoc = {
  /** ① 今のお身体の状態 */
  currentState: string;
  /** ② 理想のお身体の状態 */
  idealState: string;
  /** ③ 意識していくこと（1行1項目） */
  pointsToMind: string;
};

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
  patientDoc: { currentState: "", idealState: "", pointsToMind: "" },
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
  | { type: "applyAI"; output: AIOutput };

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
          : [...state.selections, { slug: action.slug, dosage: action.defaultDosage, note: "" }],
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
      return applyAIOutput(state, action.output);
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
    Object.values(s.patientDoc).some((v) => v.trim() !== "")
  );
}

/** 「③ 意識していくこと」を1行1項目のリストにする */
export const splitLines = (text: string): string[] =>
  text
    .split("\n")
    .map((l) => l.replace(/^\s*(?:[-*・●○]|\d+[.)．、])\s*/, "").trim())
    .filter(Boolean);
