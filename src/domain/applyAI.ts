import type { AIOutput } from "../ai/schema";
import { KARTE_KEYS } from "./karte";
import type { Session } from "./session";

/**
 * AIの出力をセッションに反映する。
 * - カルテ: AIが値を返した項目だけ上書き（返さなかった項目は今の内容を残す）
 * - 患者資料①〜③: AIの文章で上書き（空文字なら今の内容を残す）
 * - ④ セルフケア: 選択済みの種目の「ひとこと」が空欄のときだけ補完。種目の追加はしない
 * - 特定できない運動: 確認待ちに追加
 */
export type AIPart = "karte" | "patient";

/**
 * @param parts 反映する部分。サイト内AIは「患者資料 → カルテ」の2段階で作るため、片方ずつ反映できるようにする。
 *   karte   … カルテ・確認事項
 *   patient … 患者資料・セルフケアのひとこと・確認待ちの運動
 */
export function applyAIOutput(session: Session, out: AIOutput, parts: AIPart[] = ["karte", "patient"]): Session {
  const doKarte = parts.includes("karte");
  const doPatient = parts.includes("patient");
  const karte = { ...session.karte };
  for (const key of doKarte ? KARTE_KEYS : []) {
    const v = out.karte[key];
    if (typeof v === "string" && v.trim() !== "") karte[key] = v.trim();
  }

  const keep = (next: string, prev: string) => (next.trim() !== "" ? next.trim() : prev);
  const lines = (xs: string[]) => xs.map((x) => x.trim()).filter(Boolean).join("\n");
  const p = out.patient;
  const prev = session.patientDoc;

  if (!doPatient) {
    return { ...session, karte, confirmations: out.confirmations };
  }

  const notes = new Map(out.patient.selfcare.map((s) => [s.slug, (s.point ?? "").trim()]));
  const selections = session.selections.map((s) =>
    s.note.trim() === "" && notes.get(s.slug) ? { ...s, note: notes.get(s.slug) as string } : s,
  );

  const pending = [...session.pendingExercises];
  for (const name of out.unresolvedExercises) {
    const n = name.trim();
    if (n && !pending.includes(n)) pending.push(n);
  }

  return {
    ...session,
    karte,
    selections,
    pendingExercises: pending,
    patientDoc: {
      goal: keep(p.goal, prev.goal),
      currentPoints: keep(lines(p.currentPoints), prev.currentPoints),
      idealPoints: keep(lines(p.idealPoints), prev.idealPoints),
      posture: p.posture ?? prev.posture,
      focusAreas: p.focusAreas.length ? p.focusAreas : prev.focusAreas,
      mindItems: p.pointsToMind.filter((m) => m.text).length ? p.pointsToMind.filter((m) => m.text) : prev.mindItems,
    },
    confirmations: doKarte ? out.confirmations : session.confirmations,
  };
}
