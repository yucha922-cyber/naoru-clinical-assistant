import type { WebWorkerMLCEngine, InitProgressReport } from "@mlc-ai/web-llm";
import type { PromptInput } from "./prompt";
import { parseAIResponse } from "./parse";
import { buildKarteJsonSchema, buildPatientJsonSchema } from "./jsonSchema";
import type { ClinicalAIProvider, GenerateOptions } from "./provider";
import { LOCAL_CONTEXT_WINDOW, LOCAL_MAX_TOKENS_KARTE, LOCAL_MAX_TOKENS_PATIENT, LOCAL_MODELS, type LocalModelId } from "./localModels";
import { buildLocalKartePrompt, buildLocalPatientPrompt } from "./localPrompts";
import { AI_SCHEMA_VERSION } from "./schema";
import { parseStepOutput, type LocalStep } from "./localParse";

// 端末内AI（WebLLM / WebGPU）。
// - モデルはオープンソース（Qwen3）で無料。初回にモデルファイルをダウンロードし、ブラウザ内（Cache Storage）に保存する。
// - 文章生成はこの端末のGPUで行い、入力内容（施術メモ等）は外部に送信しない。
// - 有料APIは使わない。

export type WebGPUStatus = { ok: true; adapter: string; shaderF16: boolean } | { ok: false; reason: string };

export async function checkWebGPU(): Promise<WebGPUStatus> {
  const gpu = (navigator as Navigator & { gpu?: { requestAdapter(): Promise<{ info?: { vendor?: string; architecture?: string }; features: ReadonlySet<string> } | null> } }).gpu;
  if (!gpu) return { ok: false, reason: "このブラウザは WebGPU に対応していません（PC／Mac の Chrome または Edge の最新版をお使いください）。" };
  try {
    const adapter = await gpu.requestAdapter();
    if (!adapter) return { ok: false, reason: "GPU を利用できません。ブラウザのハードウェアアクセラレーションが有効か確認してください。" };
    const info = adapter.info;
    return {
      ok: true,
      adapter: [info?.vendor, info?.architecture].filter(Boolean).join(" ") || "GPU",
      shaderF16: adapter.features.has("shader-f16"),
    };
  } catch {
    return { ok: false, reason: "GPU の確認中にエラーが発生しました。" };
  }
}

let engine: WebWorkerMLCEngine | null = null;
let loadedModel: LocalModelId | null = null;
let loading: { modelId: LocalModelId; promise: Promise<WebWorkerMLCEngine> } | null = null;
/** 読み込み進捗の通知先（先読み中にボタンが押されたら、ボタン側の表示に切り替えるため差し替え可能にする） */
let progressListener: ((p: LoadProgress) => void) | undefined;

export type LoadProgress = { progress: number; text: string };

export const isLocalModelReady = (modelId: LocalModelId): boolean => engine !== null && loadedModel === modelId && !loading;

/**
 * モデルを読み込む（未ダウンロードならダウンロード）。
 * - 読み込み済みなら何もしない
 * - 同じモデルを読み込み中なら、その完了を待つ（先読みとボタン操作が重なっても二重に読み込まない）
 */
export async function loadLocalModel(modelId: LocalModelId, onProgress?: (p: LoadProgress) => void): Promise<WebWorkerMLCEngine> {
  if (onProgress) progressListener = onProgress;
  if (engine && loadedModel === modelId && !loading) return engine;
  if (loading) {
    const current = loading;
    await current.promise.catch(() => undefined);
    if (engine && loadedModel === modelId) return engine;
  }
  const webllm = await import("@mlc-ai/web-llm");
  const report = (r: InitProgressReport) => progressListener?.({ progress: r.progress, text: r.text });
  const chatOpts = { context_window_size: LOCAL_CONTEXT_WINDOW };
  const promise = (async () => {
    if (engine) {
      engine.setInitProgressCallback(report);
      await engine.reload(modelId, chatOpts);
      return engine;
    }
    const worker = new Worker(new URL("./webllm.worker.ts", import.meta.url), { type: "module" });
    return webllm.CreateWebWorkerMLCEngine(worker, modelId, { initProgressCallback: report }, chatOpts);
  })();
  loading = { modelId, promise };
  try {
    engine = await promise;
    loadedModel = modelId;
    return engine;
  } catch (e) {
    loadedModel = null;
    throw e;
  } finally {
    if (loading?.promise === promise) loading = null;
  }
}

export async function isModelDownloaded(modelId: LocalModelId): Promise<boolean> {
  try {
    const webllm = await import("@mlc-ai/web-llm");
    return await webllm.hasModelInCache(modelId);
  } catch {
    return false;
  }
}

export async function deleteDownloadedModel(modelId: LocalModelId): Promise<void> {
  const webllm = await import("@mlc-ai/web-llm");
  if (loadedModel === modelId && engine) {
    await engine.unload();
    loadedModel = null;
  }
  await webllm.deleteModelAllInfoInCache(modelId);
}

export function interruptLocalGeneration(): void {
  engine?.interruptGenerate();
}

/** 互換用: サイト内AIが読む指示文（2ステップ分）。長さの確認に使う */
export function buildLocalPrompt(input: PromptInput): string {
  return `${buildLocalPatientPrompt(input)}\n${buildLocalKartePrompt(input)}`;
}

const SYSTEM = "あなたは臨床経験豊富な理学療法士です。指示に厳密に従い、日本語で、指定された JSON だけを出力します。";

/** 1ステップ分の生成（JSON スキーマで出力形式を固定） */
async function generateStep(
  eng: WebWorkerMLCEngine,
  prompt: string,
  schema: Record<string, unknown>,
  maxTokens: number,
  opts: GenerateOptions,
  step: LocalStep,
): Promise<{ text: string; truncated: boolean }> {
  await eng.resetChat();
  const stream = await eng.chat.completions.create({
    messages: [
      { role: "system", content: SYSTEM },
      { role: "user", content: prompt },
    ],
    temperature: 0.2,
    max_tokens: maxTokens,
    stream: true,
    response_format: { type: "json_object", schema: JSON.stringify(schema) },
    extra_body: { enable_thinking: false },
  });
  let text = "";
  let truncated = false;
  for await (const chunk of stream) {
    text += chunk.choices[0]?.delta?.content ?? "";
    if (chunk.choices[0]?.finish_reason === "length") truncated = true;
    opts.onToken?.(text.length, step);
  }
  if (opts.signal?.aborted) throw new DOMException("中止しました", "AbortError");
  return { text, truncated };
}

export type { LocalStep };

export function createLocalProvider(modelId: LocalModelId): ClinicalAIProvider {
  const model = LOCAL_MODELS.find((m) => m.f16Id === modelId || m.f32Id === modelId)!;
  return {
    id: `local-webllm:${modelId}`,
    label: `このサイト内のAI（${model.label}）`,
    mode: "local",
    buildRequest: buildLocalPrompt,
    parseResponse: parseAIResponse,
    /**
     * 「患者資料 → カルテ」の2段階で生成する。
     * 各段階が終わるたびに onPartial で途中結果（取り込める形の JSON テキスト）を渡す。
     * 返り値は2段階をまとめた JSON テキスト。
     */
    async generate(input: PromptInput, opts: GenerateOptions = {}): Promise<string> {
      const eng = await loadLocalModel(modelId, opts.onLoadProgress);
      const slugs = input.selections.map((s) => s.exercise.slug);
      const onAbort = () => eng.interruptGenerate();
      opts.signal?.addEventListener("abort", onAbort, { once: true });
      try {
        // ステップ1: 患者資料
        const p = await generateStep(eng, buildLocalPatientPrompt(input), buildPatientJsonSchema(slugs), LOCAL_MAX_TOKENS_PATIENT, opts, "patient");
        const pr = parseStepOutput(p.text, "patient", { truncated: p.truncated });
        opts.onPartial?.("patient", pr.ok ? pr.text : pr.raw, pr.ok ? undefined : pr.reason);
        // ステップ2: カルテ（患者資料が失敗してもカルテは作る）
        const k = await generateStep(eng, buildLocalKartePrompt(input), buildKarteJsonSchema(), LOCAL_MAX_TOKENS_KARTE, opts, "karte");
        const kr = parseStepOutput(k.text, "karte", { truncated: k.truncated });
        opts.onPartial?.("karte", kr.ok ? kr.text : kr.raw, kr.ok ? undefined : kr.reason);
        return JSON.stringify({
          schemaVersion: AI_SCHEMA_VERSION,
          ...(pr.ok ? pr.data : {}),
          ...(kr.ok ? kr.data : {}),
        });
      } finally {
        opts.signal?.removeEventListener("abort", onAbort);
      }
    },
  };
}
