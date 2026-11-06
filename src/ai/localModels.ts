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

/**
 * 文脈長（トークン）。指示文を短くし、患者資料とカルテを分けて作るため、6144 で足りる
 * （小さいほど GPU メモリの使用量が減り、パソコンが重くなりにくい）。
 */
export const LOCAL_CONTEXT_WINDOW = 6144;
/** 各ステップの出力の上限（トークン） */
export const LOCAL_MAX_TOKENS_PATIENT = 1600;
export const LOCAL_MAX_TOKENS_KARTE = 2600;
/** 残り時間の目安に使う、出力のおおよその文字数（架空サンプルでの実測: 患者資料 約540・カルテ 約1,040 文字） */
export const LOCAL_EXPECTED_CHARS = { patient: 650, karte: 1200 } as const;
/** これを超える長さの指示文は端末内AIでは扱えない可能性が高い（日本語はおおむね1文字≒1トークン） */
export const LOCAL_MAX_PROMPT_CHARS = LOCAL_CONTEXT_WINDOW - LOCAL_MAX_TOKENS_KARTE - 300;
