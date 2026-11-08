import { describe, expect, it } from "vitest";
import { runClinicalChecks, type CheckInput } from "./clinicalCheck";
import { parseAIResponse } from "../ai/parse";
import { applyAIOutput } from "../domain/applyAI";
import { SAMPLE_AI_RESPONSE, SAMPLE_SESSION } from "../samples/sampleCase";
import { SELFCARE, findExercise } from "../data/selfcare";
import type { Session } from "../domain/session";

const slugs = SAMPLE_SESSION.selections.map((s) => s.slug);
const imported = (() => {
  const r = parseAIResponse(SAMPLE_AI_RESPONSE, slugs);
  if (!r.ok) throw new Error("sample");
  return applyAIOutput(SAMPLE_SESSION, r.value);
})();

const inputOf = (s: Session): CheckInput => ({
  memo: s.memo,
  karte: s.karte,
  doc: s.patientDoc,
  selections: s.selections,
  selectedTitles: s.selections.map((x) => findExercise(x.slug)!.title),
  libraryTitles: SELFCARE.exercises.map((e) => e.title),
  purposes: [],
});
const withKarte = (patch: Partial<Session["karte"]>): Session => ({ ...imported, karte: { ...imported.karte, ...patch } });
const withDoc = (patch: Partial<Session["patientDoc"]>): Session => ({ ...imported, patientDoc: { ...imported.patientDoc, ...patch } });
const messages = (s: Session) => runClinicalChecks(inputOf(s)).map((c) => `${c.where}: ${c.message}`);

describe("臨床チェック（元メモとの照合）", () => {
  it("元メモどおりに作られた架空サンプルでは、警告が出ない", () => {
    const warns = runClinicalChecks(inputOf(imported)).filter((c) => c.severity === "warn");
    expect(warns.map((w) => w.message)).toEqual([]);
  });

  it("元メモに無い ROM 値・NRS 値を指摘する", () => {
    const m = messages(withKarte({ effect: "頸椎右回旋 45°→70°、NRS 6→2" }));
    expect(m.join("\n")).toContain("数値「70」");
    expect(m.join("\n")).toContain("数値「6」");
    expect(m.join("\n")).toContain("数値「2」");
    expect(m.join("\n")).not.toContain("数値「45」");
  });

  it("資料の「今日確認できた変化」にメモに無い数値があれば指摘する", () => {
    const m = messages(withDoc({ changes: [{ item: "首を右に向ける動き", before: "45°", after: "65°" }] }));
    expect(m.join("\n")).toContain("今日確認できた変化: 数値「65」");
  });

  it("実施記録の無い検査・施術を指摘する（言い換え・英語表記は同じものとして扱う）", () => {
    const m = messages(withKarte({ examination: `${imported.karte.examination}\nSLR test 陰性`, treatment: `${imported.karte.treatment}、骨盤矯正、鍼` }));
    const t = m.join("\n");
    expect(t).toContain("検査「SLRテスト」");
    expect(t).toContain("施術「矯正」");
    expect(t).toContain("施術「鍼」");
    // メモの「スパーリングテスト」とカルテの「Spurling test」は同じ検査として照合できる
    expect(t).not.toContain("スパーリング");
  });

  it("評価していない姿勢の特徴（骨盤の左右差など）・イラストを指摘する", () => {
    const m = messages(withDoc({ currentPoints: "骨盤の左右差がみられました", posture: "front-pelvis-right-low" }));
    const t = m.join("\n");
    expect(t).toContain("「骨盤の歪み・左右差」の記載がありますが、元メモで評価の記録が確認できません");
    expect(t).toContain("イラスト「骨盤の右側が下がっている（正面）」");
  });

  it("原因・効果の断定を指摘する", () => {
    const m = messages(withDoc({ currentPoints: "骨盤の歪みがすべての原因です\n筋肉が神経を圧迫しています", nextGoal: "根本的に改善しました" })).join("\n");
    expect(m).toContain("原因の断定");
    expect(m).toContain("「神経を圧迫している」");
    expect(m).toContain("効果の断定（完全に・根本的に）");
  });

  it("本人が述べていない HOPE を指摘する", () => {
    const noHope = { ...withDoc({ goal: "姿勢を根本から改善する" }), memo: "主訴 腰痛\n検査 前屈で痛み" };
    expect(messages(noHope).join("\n")).toContain("元メモに本人の希望（HOPE）の記載が見つかりません");
    expect(messages(withDoc({ goal: "マラソン大会で完走する" })).join("\n")).toContain("目標の表現が、元メモの本人の言葉と大きく異なります");
  });

  it("指定していないセルフケアの記載を指摘する", () => {
    const m = messages(withKarte({ currentSelfcare: `${imported.karte.currentSelfcare}\nクラムシェル（10回）` }));
    expect(m.join("\n")).toContain("選択していないセルフケア「クラムシェル」");
  });

  it("元メモに施術前後の記録が無いのに変化がある場合を指摘する", () => {
    const s = { ...imported, memo: "主訴 首の張り\nHOPE 肩を気にせず過ごしたい\n検査 頸椎回旋 右45度" };
    expect(messages(s).join("\n")).toContain("元メモに施術前後の変化の記録が見つかりません");
  });

  it("ライブラリの目的に断定的な表現があれば、参考として知らせる（info）", () => {
    const checks = runClinicalChecks({ ...inputOf(imported), purposes: [{ title: "胸筋ストレッチ", text: "肩こりの原因となる前かがみ姿勢を改善します。", fromLibrary: true }] });
    const p = checks.find((c) => c.field === "selfcare");
    expect(p?.severity).toBe("info");
    expect(p?.message).toContain("セルフケアライブラリの説明に断定的な表現");
  });

  it("（限界）メモに別の意味で出てくる数値は区別できない: 左回旋60°を右回旋の値として書いても数値では指摘されない", () => {
    const m = messages(withDoc({ changes: [{ item: "首を右に向ける動き", before: "45°", after: "60°" }] }));
    expect(m.join("\n")).not.toContain("数値「60」は元メモで確認できません");
  });

  it("同じ指摘には同じ ID が付く（承認状態を保てる）", () => {
    const s = withKarte({ effect: "右回旋 45°→70°" });
    expect(runClinicalChecks(inputOf(s)).map((c) => c.id)).toEqual(runClinicalChecks(inputOf(s)).map((c) => c.id));
  });
});
