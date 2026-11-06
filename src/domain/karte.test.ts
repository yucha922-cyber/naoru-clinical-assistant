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
