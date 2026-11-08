import type { Exercise } from "../data/selfcare";
import type { SelectedExercise } from "../domain/session";

/**
 * 運動の目的: 施術者の追記を優先し、無ければセルフケアライブラリの「目的」（原本）を使う。
 * どちらも無い場合は空（AIや画面で医学的効果を作らない）。
 */
export const exercisePurpose = (exercise: Exercise, selection: SelectedExercise): string =>
  selection.purposeNote.trim() || exercise.purpose?.trim() || "";
