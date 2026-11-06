import { describe, expect, it } from "vitest";
import { buildOutputJsonSchema } from "./jsonSchema";
import { buildPrompt } from "./prompt";
import { parseAIResponse } from "./parse";
import { KARTE_KEYS } from "../domain/karte";
import { LOCAL_MAX_PROMPT_CHARS, LOCAL_CONTEXT_WINDOW, LOCAL_MAX_TOKENS_KARTE, LOCAL_MAX_TOKENS_PATIENT } from "./localModels";
import { buildLocalKartePrompt, buildLocalPatientPrompt } from "./localPrompts";
import { buildKarteJsonSchema, buildPatientJsonSchema } from "./jsonSchema";
import { SAMPLE_AI_RESPONSE, SAMPLE_SESSION } from "../samples/sampleCase";
import { findExercise } from "../data/selfcare";
import { sessionReducer } from "../domain/session";

type Obj = { properties: Record<string, Obj>; required: string[]; items: Obj & { enum?: string[] }; maxItems: number; enum?: string[] };

const input = {
  meta: { visitDate: SAMPLE_SESSION.meta.visitDate },
  memo: SAMPLE_SESSION.memo,
  selections: SAMPLE_SESSION.selections.map((selection) => ({ selection, exercise: findExercise(selection.slug)! })),
  pendingExercises: [],
};
const slugs = SAMPLE_SESSION.selections.map((s) => s.slug);

describe("端末内AI用 JSON Schema", () => {
  const schema = buildOutputJsonSchema(slugs) as unknown as Obj;
  it("カルテ21項目すべてを必須にする", () => {
    expect(schema.properties.karte.required).toEqual(KARTE_KEYS);
  });
  it("セルフケアは選択済みの slug だけ・件数上限つき", () => {
    const sc = schema.properties.patient.properties.selfcare;
    expect(sc.items.properties.slug.enum).toEqual(slugs);
    expect(sc.maxItems).toBe(slugs.length);
  });
  it("選択なしのときセルフケアは0件に制限", () => {
    const s0 = buildOutputJsonSchema([]) as unknown as Obj;
    expect(s0.properties.patient.properties.selfcare.maxItems).toBe(0);
  });
  it("スキーマどおりの出力（架空サンプル）を取り込める", () => {
    const r = parseAIResponse(SAMPLE_AI_RESPONSE, slugs);
    expect(r.ok).toBe(true);
  });
});

describe("端末内AI用プロンプト", () => {
  const local = buildPrompt(input, { includeExample: false });
  it("出力例を省いて短くし、ルール・メモ・選択セルフケアは残す", () => {
    expect(local.length).toBeLessThan(buildPrompt(input).length);
    expect(local).toContain("新しい運動を提案・追加しない");
    expect(local).toContain("頸椎回旋 右45度");
    expect(local).toContain("kata-chest-stretch");
    expect(local).not.toContain(SAMPLE_SESSION.meta.patientName);
  });
  it("架空サンプルの長さなら文脈長に収まる", () => {
    // サイト内AIは患者資料用・カルテ用の短い指示文を使う（下の「A:」のテストで長さを確認）
    expect(LOCAL_MAX_PROMPT_CHARS + LOCAL_MAX_TOKENS_KARTE).toBeLessThan(LOCAL_CONTEXT_WINDOW);
    expect(LOCAL_MAX_PROMPT_CHARS + LOCAL_MAX_TOKENS_PATIENT).toBeLessThan(LOCAL_CONTEXT_WINDOW);
  });
});

describe("applyAI アクション", () => {
  it("生成中に編集されたメモを上書きしない（最新の状態に反映する）", () => {
    const r = parseAIResponse(SAMPLE_AI_RESPONSE, slugs);
    if (!r.ok) throw new Error();
    const edited = { ...SAMPLE_SESSION, memo: "生成中に追記したメモ" };
    const next = sessionReducer(edited, { type: "applyAI", output: r.value });
    expect(next.memo).toBe("生成中に追記したメモ");
    expect(next.karte.chiefComplaint).toContain("右頸部");
  });
});

describe("端末内AIのモデル定義", () => {
  it("すべてのモデルIDが WebLLM の公開モデル一覧に存在し、文脈長を上書きできる", async () => {
    const { prebuiltAppConfig } = await import("@mlc-ai/web-llm");
    const { LOCAL_MODELS } = await import("./localModels");
    const ids = new Set(prebuiltAppConfig.model_list.map((m) => m.model_id));
    for (const m of LOCAL_MODELS) {
      expect(ids.has(m.f16Id)).toBe(true);
      expect(ids.has(m.f32Id)).toBe(true);
    }
  });
});

describe("A: サイト内AI用の短い指示文（患者資料・カルテの2段階）", () => {
  const patient = buildLocalPatientPrompt(input);
  const karte = buildLocalKartePrompt(input);
  const full = buildPrompt(input, { includeExample: false });

  it("それぞれ従来の統合指示文の約半分以下の長さ", () => {
    expect(patient.length).toBeLessThan(full.length * 0.55);
    expect(karte.length).toBeLessThan(full.length * 0.55);
    expect(Math.max(patient.length, karte.length)).toBeLessThan(LOCAL_MAX_PROMPT_CHARS);
  });

  it("患者資料用: 院の資料ルールと選択済みセルフケア・メモを含み、氏名は含まない", () => {
    expect(patient).toContain("専門用語は使わない");
    expect(patient).toContain("原因を断定しない");
    expect(patient).toContain("新しい運動は書かない");
    expect(patient).toContain("kata-chest-stretch=胸筋ストレッチ");
    expect(patient).toContain("頸椎回旋 右45度");
    expect(patient).toContain("side-forward-head");
    expect(patient).not.toContain(SAMPLE_SESSION.meta.patientName);
  });

  it("カルテ用: 臨床記載のルール・全21項目・メモを含み、氏名は含まない", () => {
    expect(karte).toContain("メモに無い検査・施術・数値を足さない");
    expect(karte).toContain("主観（本人の申告）・客観（検査・観察）・仮説を分ける");
    expect(karte).toContain("施術直後の効果と長期的な改善を分ける");
    expect(karte).toContain("dropoutReason=離反理由");
    expect(karte).toContain("胸筋ストレッチ（左右20秒×2回／1日2セット）");
    expect(karte).toContain("頸椎回旋 右45度");
    expect(karte).not.toContain(SAMPLE_SESSION.meta.patientName);
  });

  it("段階ごとの JSON スキーマは担当部分だけを要求する", () => {
    const ps = buildPatientJsonSchema(slugs) as { required: string[] };
    const ks = buildKarteJsonSchema() as { required: string[] };
    expect(ps.required).toEqual(["patient", "unresolvedExercises"]);
    expect(ks.required).toEqual(["karte", "confirmations"]);
  });
});

describe("B: 患者資料 → カルテ の順に反映", () => {
  it("患者資料だけ反映してもカルテ・確認事項は変わらず、続けてカルテだけ反映すると両方そろう", () => {
    const r = parseAIResponse(SAMPLE_AI_RESPONSE, slugs);
    if (!r.ok) throw new Error();
    const before = { ...SAMPLE_SESSION, confirmations: ["前回の確認事項"] };
    const s1 = sessionReducer(before, { type: "applyAI", output: r.value, parts: ["patient"] });
    expect(s1.patientDoc.goal).toBe("仕事のあとも肩を気にせず過ごす");
    expect(s1.pendingExercises).toEqual(["壁を使ったドリル"]);
    expect(s1.karte.chiefComplaint).toBe("");
    expect(s1.confirmations).toEqual(["前回の確認事項"]);
    const s2 = sessionReducer(s1, { type: "applyAI", output: r.value, parts: ["karte"] });
    expect(s2.karte.chiefComplaint).toContain("右頸部");
    expect(s2.patientDoc).toEqual(s1.patientDoc);
    expect(s2.confirmations.length).toBeGreaterThan(1);
  });

  it("各段階の途中結果（相手側が空）を取り込める", () => {
    const patientOnly = JSON.stringify({ schemaVersion: "2.0", karte: {}, patient: { goal: "g", currentPoints: ["a"], idealPoints: ["b"], posture: null, focusAreas: [], pointsToMind: [], selfcare: [] }, unresolvedExercises: [] });
    const karteOnly = JSON.stringify({ schemaVersion: "2.0", patient: { currentPoints: [], idealPoints: [], pointsToMind: [] }, karte: { chiefComplaint: "腰痛" }, confirmations: [] });
    expect(parseAIResponse(patientOnly, slugs).ok).toBe(true);
    expect(parseAIResponse(karteOnly, slugs).ok).toBe(true);
  });
});
