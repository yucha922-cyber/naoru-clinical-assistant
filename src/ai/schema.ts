import { z } from "zod";
import { KARTE_KEYS, type KarteKey } from "../domain/karte";
import { BODY_AREA_KEYS, MIND_ICON_KEYS, POSTURE_KEYS, guessMindIcon } from "../doc/postures";

// AI（ChatGPT / Claude など）に出力してもらう JSON の形。
// 文字列の代わりに配列が返ってきた場合は改行でつなげて受け付ける（よくある揺れの吸収）。

export const AI_SCHEMA_VERSION = "2.0";

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

/** 文章を「。」で区切って箇条書きにする（旧形式の長い文章を受け取ったとき用） */
const toSentences = (s: string): string[] =>
  s
    .split(/(?<=。)|\n/)
    .map((x) => x.trim())
    .filter(Boolean);

const mindItem = z.preprocess(
  (v) => (typeof v === "string" ? { text: v } : v),
  z
    .object({ icon: z.string().optional(), text: text })
    .transform((o) => ({
      icon: (MIND_ICON_KEYS as string[]).includes(o.icon ?? "") ? (o.icon as (typeof MIND_ICON_KEYS)[number]) : guessMindIcon(o.text),
      text: o.text.trim(),
    })),
);

/**
 * 旧形式（schemaVersion 1.0: currentState / idealState の文章）も受け付けて新形式にそろえる。
 */
const normalizePatient = (v: unknown) => {
  if (!v || typeof v !== "object") return v;
  const o = { ...(v as Record<string, unknown>) };
  if (o.currentPoints === undefined && typeof o.currentState === "string") o.currentPoints = toSentences(o.currentState);
  if (o.idealPoints === undefined && typeof o.idealState === "string") o.idealPoints = toSentences(o.idealState);
  return o;
};

export const aiOutputSchema = z.object({
  schemaVersion: z.string().optional(),
  karte: z.object(karteShape),
  patient: z.preprocess(normalizePatient, z.object({
    /** 目標（HOPEをもとにした短いひとこと） */
    goal: text.optional().default(""),
    /** ① 今のお身体の状態（箇条書き） */
    currentPoints: textList,
    /** ② 理想のお身体の状態（箇条書き） */
    idealPoints: textList,
    /** 姿勢イラストの種類。不明・該当なしは null */
    posture: z.preprocess((x) => ((POSTURE_KEYS as string[]).includes(x as string) ? x : null), z.enum(POSTURE_KEYS).nullable()).optional().default(null),
    /** 気になる部位（イラストに印を付ける） */
    focusAreas: z
      .preprocess((x) => (Array.isArray(x) ? x.filter((a) => (BODY_AREA_KEYS as string[]).includes(a)) : []), z.array(z.enum(BODY_AREA_KEYS)))
      .optional()
      .default([]),
    /** ③ 意識していくこと（アイコン＋ひとこと） */
    pointsToMind: z.preprocess((x) => (x === undefined || x === null ? [] : typeof x === "string" ? toSentences(x) : x), z.array(mindItem)),
    selfcare: z
      .array(
        z.object({
          slug: z.string(),
          point: text.optional(),
        }),
      )
      .optional()
      .default([]),
  })),
  unresolvedExercises: textList.optional().default([]),
  confirmations: textList.optional().default([]),
});

export type AIOutput = z.infer<typeof aiOutputSchema>;
