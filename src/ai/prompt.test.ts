import { describe, expect, it } from "vitest";
import { buildPrompt, findPrivacyWarnings } from "./prompt";
import { SAMPLE_SESSION } from "../samples/sampleCase";
import { findExercise } from "../data/selfcare";

const input = {
  meta: { visitDate: SAMPLE_SESSION.meta.visitDate },
  memo: SAMPLE_SESSION.memo,
  selections: SAMPLE_SESSION.selections.map((selection) => ({ selection, exercise: findExercise(selection.slug)! })),
  pendingExercises: ["壁ドリル"],
};

describe("buildPrompt", () => {
  const prompt = buildPrompt(input);

  it("患者名・担当者名を含めない", () => {
    expect(prompt).not.toContain(SAMPLE_SESSION.meta.patientName);
    expect(prompt).not.toContain(SAMPLE_SESSION.meta.therapistName);
  });

  it("選択済みのセルフケアと施術メモ、全カルテ項目、重要ルールを含む", () => {
    expect(prompt).toContain("kata-chest-stretch");
    expect(prompt).toContain("胸筋ストレッチ");
    expect(prompt).toContain("左右20秒×2回");
    expect(prompt).toContain("壁ドリル");
    expect(prompt).toContain("頸椎回旋 右45度");
    expect(prompt).toContain("【離反理由】");
    expect(prompt).toContain("検査・施術・測定値を追加しない");
    expect(prompt).toContain("新しい運動を提案・追加しない");
    expect(prompt).toContain("断定しない");
  });

  it("選択していない運動の slug を含めない", () => {
    expect(prompt).not.toContain("hamstring-stretch");
  });
});

describe("findPrivacyWarnings", () => {
  it("氏名・電話番号・メールを検出する", () => {
    const w = findPrivacyWarnings("架空 花子さん 090-1234-5678 test@example.com", "架空 花子");
    expect(w).toHaveLength(3);
  });
  it("問題がなければ空", () => {
    expect(findPrivacyWarnings("頸椎右回旋45°", "")).toEqual([]);
  });
});
