import { describe, expect, it } from "vitest";
import { buildOutputJsonSchema } from "./jsonSchema";
import { buildPrompt } from "./prompt";
import { parseAIResponse } from "./parse";
import { KARTE_KEYS } from "../domain/karte";
import { LOCAL_MAX_PROMPT_CHARS, LOCAL_CONTEXT_WINDOW, LOCAL_MAX_OUTPUT_TOKENS } from "./localModels";
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
    expect(local.length).toBeLessThan(LOCAL_MAX_PROMPT_CHARS);
    expect(LOCAL_MAX_PROMPT_CHARS + LOCAL_MAX_OUTPUT_TOKENS).toBeLessThan(LOCAL_CONTEXT_WINDOW);
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
