import { describe, expect, it } from "vitest";
import { KARTE_FIELDS, emptyKarte, formatKarte } from "./karte";
import { sessionReducer, emptySession, splitLines, hasUserInput } from "./session";

describe("formatKarte", () => {
  it("NAORU整体フォーマット順で、空欄の項目は省略する", () => {
    const k = { ...emptyKarte(), effect: "即時: 改善", chiefComplaint: "腰痛 " };
    expect(formatKarte(k)).toBe("【主訴】\n腰痛\n\n【効果】\n即時: 改善");
  });
  it("includeEmpty で全見出しを出す", () => {
    const out = formatKarte(emptyKarte(), { includeEmpty: true });
    expect(out.match(/【/g)).toHaveLength(KARTE_FIELDS.length);
    expect(KARTE_FIELDS).toHaveLength(21);
  });
});

describe("sessionReducer", () => {
  it("セルフケアの選択・並べ替え・解除", () => {
    let s = emptySession();
    s = sessionReducer(s, { type: "toggleExercise", slug: "a", defaultDosage: "約3分" });
    s = sessionReducer(s, { type: "toggleExercise", slug: "b", defaultDosage: "" });
    s = sessionReducer(s, { type: "moveSelection", slug: "b", delta: -1 });
    expect(s.selections.map((x) => x.slug)).toEqual(["b", "a"]);
    expect(s.selections[1].dosage).toBe("約3分");
    s = sessionReducer(s, { type: "toggleExercise", slug: "a", defaultDosage: "" });
    expect(s.selections.map((x) => x.slug)).toEqual(["b"]);
  });
  it("確認待ちは重複しない", () => {
    let s = emptySession();
    s = sessionReducer(s, { type: "addPending", name: "壁ドリル" });
    s = sessionReducer(s, { type: "addPending", name: " 壁ドリル " });
    expect(s.pendingExercises).toEqual(["壁ドリル"]);
    expect(hasUserInput(s)).toBe(true);
    expect(hasUserInput(emptySession())).toBe(false);
  });
});

describe("splitLines", () => {
  it("箇条書き記号を取り除く", () => {
    expect(splitLines("・a\n- b\n\n1. c")).toEqual(["a", "b", "c"]);
  });
});

describe("施術者による確認（review）", () => {
  it("確認済みの付け外しができ、AIで作り直した部分の確認はリセットされる", async () => {
    const { parseAIResponse } = await import("../ai/parse");
    const { SAMPLE_AI_RESPONSE, SAMPLE_SESSION } = await import("../samples/sampleCase");
    const r = parseAIResponse(SAMPLE_AI_RESPONSE, SAMPLE_SESSION.selections.map((x) => x.slug));
    if (!r.ok) throw new Error();
    let s = sessionReducer(SAMPLE_SESSION, { type: "approveCheck", id: "karte:effect:num:70", approved: true });
    s = sessionReducer(s, { type: "approveCheck", id: "patient:goal:hope:diff", approved: true });
    s = sessionReducer(s, { type: "setConfirmed", part: "karte", value: true });
    s = sessionReducer(s, { type: "setConfirmed", part: "doc", value: true });
    expect(s.review).toEqual({ approved: ["karte:effect:num:70", "patient:goal:hope:diff"], karteConfirmed: true, docConfirmed: true });
    // 患者資料だけ作り直す → 資料側の確認だけやり直し
    const s2 = sessionReducer(s, { type: "applyAI", output: r.value, parts: ["patient"] });
    expect(s2.review).toEqual({ approved: ["karte:effect:num:70"], karteConfirmed: true, docConfirmed: false });
    // 取り消し
    const s3 = sessionReducer(s2, { type: "approveCheck", id: "karte:effect:num:70", approved: false });
    expect(s3.review.approved).toEqual([]);
  });
});
