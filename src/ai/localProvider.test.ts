import { describe, expect, it, vi, beforeAll } from "vitest";
import { parseStepOutput, stripThinking } from "./localParse";
import { parseAIResponse } from "./parse";
import { SAMPLE_AI_RESPONSE, SAMPLE_SESSION } from "../samples/sampleCase";
import { extractJson } from "./parse";
import { findExercise } from "../data/selfcare";

// 実物の Qwen3 と同じく、出力の先頭に空の思考ブロックが付く
const THINK = "<think>\n\n</think>\n\n";
const sample = JSON.parse(extractJson(SAMPLE_AI_RESPONSE)!);
const patientJson = JSON.stringify({ patient: sample.patient, unresolvedExercises: sample.unresolvedExercises });
const karteJson = JSON.stringify({ karte: sample.karte, confirmations: sample.confirmations });
const slugs = SAMPLE_SESSION.selections.map((s) => s.slug);

describe("parseStepOutput（サイト内AIの各ステップの出力）", () => {
  it("先頭の <think></think> を取り除いて読める（不具合の再発防止）", () => {
    expect(stripThinking(THINK + "{}")).toBe("{}");
    const r = parseStepOutput(THINK + patientJson, "patient");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const imported = parseAIResponse(r.text, slugs);
    expect(imported.ok).toBe(true);
    if (imported.ok) expect(imported.value.patient.goal).toBe("仕事のあとも肩を気にせず過ごす");
  });
  it("コードブロックや前後の文字があっても読める", () => {
    expect(parseStepOutput("はい。\n```json\n" + karteJson + "\n```", "karte").ok).toBe(true);
  });
  it("途中で切れた出力は、切れたことを伝える", () => {
    const r = parseStepOutput(THINK + patientJson.slice(0, 120), "patient", { truncated: true });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.reason).toContain("途中で終わりました");
      expect(r.raw).toContain("<think>");
    }
  });
  it("必要な項目が無い出力はエラー", () => {
    const r = parseStepOutput(THINK + karteJson, "patient");
    expect(r.ok).toBe(false);
  });
});

// ---- 実際の生成処理（createLocalProvider().generate）を、AIエンジンだけ偽物にして動かす ----
let outputs: string[] = [];
vi.mock("@mlc-ai/web-llm", () => ({
  CreateWebWorkerMLCEngine: async () => ({
    resetChat: async () => {},
    interruptGenerate: () => {},
    setInitProgressCallback: () => {},
    chat: {
      completions: {
        create: async () => {
          const text = outputs.shift() ?? "";
          return (async function* () {
            for (let i = 0; i < text.length; i += 37) {
              yield { choices: [{ delta: { content: text.slice(i, i + 37) }, finish_reason: i + 37 >= text.length ? "stop" : null }] };
            }
          })();
        },
      },
    },
  }),
}));

describe("サイト内AIの2段階生成（AIエンジンは偽物）", () => {
  beforeAll(() => {
    (globalThis as unknown as { Worker: unknown }).Worker = class {};
  });
  const input = {
    meta: { visitDate: "2026-11-06" },
    memo: SAMPLE_SESSION.memo,
    selections: SAMPLE_SESSION.selections.map((selection) => ({ selection, exercise: findExercise(selection.slug)! })),
    pendingExercises: [],
  };

  it("<think> 付きの出力でも、患者資料→カルテの順に取り込める形で渡される", async () => {
    outputs = [THINK + patientJson, THINK + karteJson];
    const { createLocalProvider } = await import("./localProvider");
    const partials: { part: string; ok: boolean; error?: string }[] = [];
    const steps = new Set<string>();
    const final = await createLocalProvider("Qwen3-8B-q4f16_1-MLC").generate!(input, {
      onToken: (_c, step) => step && steps.add(step),
      onPartial: (part, text, error) => partials.push({ part, ok: parseAIResponse(text, slugs).ok, error }),
    });
    expect(partials).toEqual([
      { part: "patient", ok: true, error: undefined },
      { part: "karte", ok: true, error: undefined },
    ]);
    expect([...steps]).toEqual(["patient", "karte"]);
    const all = parseAIResponse(final, slugs);
    expect(all.ok).toBe(true);
  });

  it("患者資料の出力が壊れていてもカルテは作成し、理由を伝える", async () => {
    outputs = [THINK + '{"patient": {"goal": "途中', THINK + karteJson];
    const { createLocalProvider } = await import("./localProvider");
    const partials: { part: string; error?: string }[] = [];
    await createLocalProvider("Qwen3-8B-q4f16_1-MLC").generate!(input, {
      onPartial: (part, _t, error) => partials.push({ part, error }),
    });
    expect(partials[0].part).toBe("patient");
    expect(partials[0].error).toContain("読み取れませんでした");
    expect(partials[1]).toEqual({ part: "karte", error: undefined });
  });
});
