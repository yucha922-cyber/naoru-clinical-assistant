import { describe, expect, it } from "vitest";
import { extractJson, parseAIResponse } from "./parse";
import { SAMPLE_AI_RESPONSE, SAMPLE_SESSION } from "../samples/sampleCase";
import { applyAIOutput } from "../domain/applyAI";

const selected = SAMPLE_SESSION.selections.map((s) => s.slug);

describe("parseAIResponse", () => {
  it("架空サンプルの返答（```json フェンス＋前置き文）を取り込める", () => {
    const r = parseAIResponse(SAMPLE_AI_RESPONSE, selected);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.karte.chiefComplaint).toContain("右頸部");
    expect(r.value.patient.pointsToMind).toHaveLength(3);
    expect(r.value.unresolvedExercises).toEqual(["壁を使ったドリル"]);
    expect(r.warnings).toEqual([]);
  });

  it("空文字はエラー", () => {
    const r = parseAIResponse("   ", selected);
    expect(r.ok).toBe(false);
  });

  it("JSON が無い返答はエラー", () => {
    const r = parseAIResponse("すみません、もう一度お願いします。", selected);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors[0]).toContain("JSON");
  });

  it("途中で途切れた JSON は「途切れている可能性」を案内する", () => {
    const cut = SAMPLE_AI_RESPONSE.slice(0, SAMPLE_AI_RESPONSE.indexOf('"patient"') + 20);
    const r = parseAIResponse(cut, selected);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.join()).toContain("途切れて");
  });

  it("必須項目（patient）が無い場合は項目名つきでエラー", () => {
    const r = parseAIResponse(JSON.stringify({ karte: {} }), selected);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.join()).toContain("患者資料");
  });

  it("配列で返ってきたカルテ項目は改行でつなぐ", () => {
    const r = parseAIResponse(
      JSON.stringify({
        karte: { examination: ["頸椎右回旋 45°", "Spurling test 陰性"] },
        patient: { currentState: "a", idealState: "b", pointsToMind: "x\ny" },
      }),
      selected,
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.karte.examination).toBe("頸椎右回旋 45°\nSpurling test 陰性");
    expect(r.value.patient.pointsToMind).toEqual(["x", "y"]);
  });

  it("施術者が選択していない運動は除外し、警告を出す", () => {
    const r = parseAIResponse(
      JSON.stringify({
        karte: { unknownField: "x" },
        patient: {
          currentState: "a",
          idealState: "b",
          pointsToMind: [],
          selfcare: [
            { slug: "kata-chest-stretch", point: "ok" },
            { slug: "bridge", point: "AIが勝手に追加" },
          ],
        },
      }),
      selected,
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.patient.selfcare.map((s) => s.slug)).toEqual(["kata-chest-stretch"]);
    expect(r.warnings.join()).toContain("bridge");
    expect(r.warnings.join()).toContain("unknownField");
  });
});

describe("extractJson", () => {
  it("前後の説明文を除く", () => {
    expect(extractJson('はい。{"a":1} 以上です')).toBe('{"a":1}');
  });
});

describe("applyAIOutput", () => {
  it("カルテ・資料に反映し、選択済みのひとことだけ補完、確認待ちを追加する", () => {
    const r = parseAIResponse(SAMPLE_AI_RESPONSE, selected);
    if (!r.ok) throw new Error("parse failed");
    const before = structuredClone(SAMPLE_SESSION);
    before.selections[0].note = "施術者が書いたメモ";
    before.karte.history = "既存の既往歴";
    const after = applyAIOutput(before, r.value);
    expect(after.karte.chiefComplaint).not.toBe("");
    expect(after.karte.history).toBe("既存の既往歴"); // AIが空欄なら既存を残す
    expect(after.selections[0].note).toBe("施術者が書いたメモ"); // 施術者の入力は上書きしない
    expect(after.selections[1].note).toContain("あごを引く");
    expect(after.selections.map((s) => s.slug)).toEqual(selected); // 種目は増減しない
    expect(after.pendingExercises).toEqual(["壁を使ったドリル"]);
    expect(after.confirmations.length).toBeGreaterThan(0);
  });
});
