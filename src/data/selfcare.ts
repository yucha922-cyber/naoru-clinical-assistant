import { z } from "zod";
import raw from "./selfcare.json";

// src/data/selfcare.json は scripts/sync-selfcare.mjs が selfexercise から生成する公開データです。
// 患者個別のデータはここに含めません（公開データと患者データの分離）。

const categoryRef = z.object({ slug: z.string(), name: z.string().nullable() });

export const exerciseSchema = z.object({
  id: z.string(),
  slug: z.string(),
  title: z.string(),
  category: z.array(categoryRef),
  bodyPart: z.array(categoryRef),
  purpose: z.string().nullable(),
  instructions: z.array(z.string()),
  precautions: z.array(z.string()),
  duration: z.string().nullable(),
  difficulty: z.number().nullable(),
  tags: z.array(z.string()),
  order: z.number().nullable(),
  images: z.array(
    z.object({
      url: z.string().url(),
      path: z.string(),
      label: z.string().nullable(),
      kind: z.enum(["ok", "ng", "step"]).nullable(),
      caption: z.string().nullable(),
    }),
  ),
  imageUrls: z.array(z.string().url()),
  videoUrl: z.string().url().nullable(),
  videoMobileUrl: z.string().url().nullable(),
  detailUrl: z.string().url(),
  requiresMemberCode: z.boolean(),
  sourceFile: z.string(),
});

export const selfcareDataSchema = z.object({
  source: z.object({ repository: z.string(), site: z.string(), commit: z.string().nullable() }),
  categories: z.object({
    symptoms: z.array(z.object({ slug: z.string(), name: z.string() })),
    parts: z.array(z.object({ slug: z.string(), name: z.string() })),
  }),
  exercises: z.array(exerciseSchema),
});

export type Exercise = z.infer<typeof exerciseSchema>;
export type SelfcareData = z.infer<typeof selfcareDataSchema>;

export const SELFCARE: SelfcareData = selfcareDataSchema.parse(raw);

const bySlug = new Map(SELFCARE.exercises.map((e) => [e.slug, e]));

export const findExercise = (slug: string): Exercise | undefined => bySlug.get(slug);

/** キーワード・症状・部位で絞り込む */
export function searchExercises(
  list: Exercise[],
  { keyword, symptom, part }: { keyword?: string; symptom?: string | null; part?: string | null },
): Exercise[] {
  const words = (keyword ?? "")
    .toLowerCase()
    .split(/[\s\u3000]+/)
    .filter(Boolean);
  return list.filter((e) => {
    if (symptom && !e.category.some((c) => c.slug === symptom)) return false;
    if (part && !e.bodyPart.some((c) => c.slug === part)) return false;
    if (words.length === 0) return true;
    const haystack = [
      e.title,
      e.slug,
      e.purpose ?? "",
      ...e.tags,
      ...e.category.map((c) => c.name ?? c.slug),
      ...e.bodyPart.map((c) => c.name ?? c.slug),
    ]
      .join(" ")
      .toLowerCase();
    return words.every((w) => haystack.includes(w));
  });
}
