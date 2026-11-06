import type { WebWorkerMLCEngine, InitProgressReport } from "@mlc-ai/web-llm";
import { buildPrompt, type PromptInput } from "./prompt";
import { parseAIResponse } from "./parse";
import { buildOutputJsonSchema } from "./jsonSchema";
import type { ClinicalAIProvider, GenerateOptions } from "./provider";
import { LOCAL_CONTEXT_WINDOW, LOCAL_MAX_OUTPUT_TOKENS, LOCAL_MODELS, type LocalModelId } from "./localModels";

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
let loading: Promise<WebWorkerMLCEngine> | null = null;

export type LoadProgress = { progress: number; text: string };

/** モデルを読み込む（未ダウンロードならダウンロード）。読み込み済みなら何もしない */
export async function loadLocalModel(modelId: LocalModelId, onProgress?: (p: LoadProgress) => void): Promise<WebWorkerMLCEngine> {
  if (engine && loadedModel === modelId) return engine;
  if (loading) await loading.catch(() => undefined);
  const webllm = await import("@mlc-ai/web-llm");
  const report = (r: InitProgressReport) => onProgress?.({ progress: r.progress, text: r.text });
  const chatOpts = { context_window_size: LOCAL_CONTEXT_WINDOW };
  loading = (async () => {
    if (engine) {
      engine.setInitProgressCallback(report);
      await engine.reload(modelId, chatOpts);
      return engine;
    }
    const worker = new Worker(new URL("./webllm.worker.ts", import.meta.url), { type: "module" });
    return webllm.CreateWebWorkerMLCEngine(worker, modelId, { initProgressCallback: report }, chatOpts);
  })();
  try {
    engine = await loading;
    loadedModel = modelId;
    return engine;
  } catch (e) {
    loadedModel = null;
    throw e;
  } finally {
    loading = null;
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

export function buildLocalPrompt(input: PromptInput): string {
  return buildPrompt(input, { includeExample: false });
}

export function createLocalProvider(modelId: LocalModelId): ClinicalAIProvider {
  const model = LOCAL_MODELS.find((m) => m.f16Id === modelId || m.f32Id === modelId)!;
  return {
    id: `local-webllm:${modelId}`,
    label: `このサイト内のAI（${model.label}）`,
    mode: "local",
    buildRequest: buildLocalPrompt,
    parseResponse: parseAIResponse,
    async generate(input: PromptInput, opts: GenerateOptions = {}): Promise<string> {
      const eng = await loadLocalModel(modelId, opts.onLoadProgress);
      await eng.resetChat();
      const slugs = input.selections.map((s) => s.exercise.slug);
      const onAbort = () => eng.interruptGenerate();
      opts.signal?.addEventListener("abort", onAbort, { once: true });
      try {
        const stream = await eng.chat.completions.create({
          messages: [
            {
              role: "system",
              content: "あなたは臨床経験豊富な理学療法士です。指示に厳密に従い、日本語で、指定された JSON だけを出力します。",
            },
            { role: "user", content: buildLocalPrompt(input) },
          ],
          temperature: 0.2,
          max_tokens: LOCAL_MAX_OUTPUT_TOKENS,
          stream: true,
          response_format: { type: "json_object", schema: JSON.stringify(buildOutputJsonSchema(slugs)) },
          extra_body: { enable_thinking: false },
        });
        let text = "";
        for await (const chunk of stream) {
          text += chunk.choices[0]?.delta?.content ?? "";
          opts.onToken?.(text.length);
        }
        if (opts.signal?.aborted) throw new DOMException("中止しました", "AbortError");
        return text;
      } finally {
        opts.signal?.removeEventListener("abort", onAbort);
      }
    },
  };
}
