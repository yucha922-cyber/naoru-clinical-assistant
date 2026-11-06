// 端末内AIで使えるモデル（オープンソース・無料）。初回のみダウンロードし、以後はブラウザ内に保存される。
// GPU が 16bit 浮動小数点（shader-f16）に対応していない端末では、自動的に f32 版を使う。
export const LOCAL_MODELS = [
  {
    key: "standard",
    label: "標準（Qwen3 8B）",
    f16Id: "Qwen3-8B-q4f16_1-MLC",
    f32Id: "Qwen3-8B-q4f32_1-MLC",
    download: "約5GB",
    note: "文章の質を優先。GPUメモリ8GB以上のPC／Mac（Apple シリコン 16GB 推奨）向け",
  },
  {
    key: "light",
    label: "軽量（Qwen3 4B）",
    f16Id: "Qwen3-4B-q4f16_1-MLC",
    f32Id: "Qwen3-4B-q4f32_1-MLC",
    download: "約2.5GB",
    note: "動作が軽い代わりに、文章の質は下がります",
  },
] as const;

export type LocalModel = (typeof LOCAL_MODELS)[number];
export type LocalModelKey = LocalModel["key"];
export type LocalModelId = LocalModel["f16Id"] | LocalModel["f32Id"];

export const resolveModelId = (key: LocalModelKey, shaderF16: boolean): LocalModelId => {
  const m = LOCAL_MODELS.find((x) => x.key === key)!;
  return shaderF16 ? m.f16Id : m.f32Id;
};

/** プロンプトと出力を収めるための文脈長（トークン）。既定の4096では日本語のカルテが収まらない */
export const LOCAL_CONTEXT_WINDOW = 8192;
/** 出力の上限（トークン） */
export const LOCAL_MAX_OUTPUT_TOKENS = 3500;
/** これを超える長さのプロンプトは端末内AIでは扱えない可能性が高い（日本語はおおむね1文字≒1トークン） */
export const LOCAL_MAX_PROMPT_CHARS = LOCAL_CONTEXT_WINDOW - LOCAL_MAX_OUTPUT_TOKENS - 300;
