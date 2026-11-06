import { z } from "zod";
import { KARTE_KEYS, type KarteKey } from "../domain/karte";

// AI（ChatGPT / Claude など）に出力してもらう JSON の形。
// 文字列の代わりに配列が返ってきた場合は改行でつなげて受け付ける（よくある揺れの吸収）。

export const AI_SCHEMA_VERSION = "1.0";

const text = z.preprocess(
  (v) => (Array.isArray(v) ? v.filter((x) => typeof x === "string").join("\n") : v === null ? "" : v),
  z.string(),
);

const textList = z.preprocess(
  (v) =>
    typeof v === "string"
      ? v
          .split("\n")
          .map((s) => s.trim())
          .filter(Boolean)
      : v === null || v === undefined
        ? []
        : v,
  z.array(z.string()),
);

const karteShape = Object.fromEntries(KARTE_KEYS.map((k) => [k, text.optional()])) as Record<
  KarteKey,
  z.ZodOptional<typeof text>
>;

export const aiOutputSchema = z.object({
  schemaVersion: z.string().optional(),
  karte: z.object(karteShape),
  patient: z.object({
    currentState: text,
    idealState: text,
    pointsToMind: textList,
    selfcare: z
      .array(
        z.object({
          slug: z.string(),
          point: text.optional(),
        }),
      )
      .optional()
      .default([]),
  }),
  unresolvedExercises: textList.optional().default([]),
  confirmations: textList.optional().default([]),
});

export type AIOutput = z.infer<typeof aiOutputSchema>;
