import { useMemo } from "react";
import { useApp } from "../state";
import { SELFCARE, findExercise } from "../data/selfcare";
import { exercisePurpose } from "../doc/exercise";
import { runClinicalChecks, type CheckArea, type ClinicalCheck } from "./clinicalCheck";

export type CheckStatus = ClinicalCheck & { approved: boolean };

/** 現在の入力内容に対する臨床チェックの結果（承認状態つき） */
export function useClinicalChecks(area?: CheckArea): { checks: CheckStatus[]; openWarnings: number } {
  const { session } = useApp();
  const checks = useMemo(() => {
    const resolved = session.selections.flatMap((selection) => {
      const exercise = findExercise(selection.slug);
      return exercise ? [{ selection, exercise }] : [];
    });
    return runClinicalChecks({
      memo: session.memo,
      karte: session.karte,
      doc: session.patientDoc,
      selections: session.selections,
      selectedTitles: resolved.map((r) => r.exercise.title),
      libraryTitles: SELFCARE.exercises.map((e) => e.title),
      purposes: resolved.map((r) => ({
        title: r.exercise.title,
        text: exercisePurpose(r.exercise, r.selection),
        fromLibrary: !r.selection.purposeNote.trim(),
      })),
    });
  }, [session.memo, session.karte, session.patientDoc, session.selections]);
  const approved = new Set(session.review.approved);
  const list = checks.filter((c) => !area || c.area === area).map((c) => ({ ...c, approved: approved.has(c.id) }));
  return { checks: list, openWarnings: list.filter((c) => c.severity === "warn" && !c.approved).length };
}
