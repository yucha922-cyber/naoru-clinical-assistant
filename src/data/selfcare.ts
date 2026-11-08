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

// ---------- 検索 ----------
// 表記ゆれ（カタカナ／ひらがな・全角／半角）と、同じ意味の言い換えだけを吸収する。
// ★ 医学的に異なるもの（例: 大胸筋と小胸筋）は同じ扱いにしない。

/** 同じ意味として扱う言い換え（グループ内のどれで検索しても、グループ全体で探す） */
export const SEARCH_SYNONYMS: string[][] = [
  ["大胸筋", "胸筋", "胸の筋肉"],
  ["胸", "胸部"],
  ["胸鎖乳突筋", "首の前の筋肉"],
  ["後頭下筋群", "後頭下筋"],
  ["梨状筋"],
  ["殿筋", "臀筋", "お尻の筋肉"],
  ["お尻", "おしり", "臀部", "殿部"],
  ["腸腰筋", "脚の付け根の前"],
  ["ハムストリングス", "ハムストリング", "太もも裏", "もも裏", "太ももの裏"],
  ["大腿四頭筋", "太もも前", "もも前", "太ももの前"],
  ["内転筋", "内もも", "太ももの内側"],
  ["ふくらはぎ", "下腿三頭筋", "カーフ"],
  ["足底筋膜", "足裏", "足の裏"],
  ["胸椎", "背中の上"],
  ["首", "頸部", "頚部"],
  ["腰", "腰部"],
  ["顎引き", "あご引き", "チンタック"],
  ["ストレッチ", "伸ばす"],
  ["猫背", "円背"],
  ["五十肩", "四十肩"],
  ["キャット&カウ", "キャットアンドカウ", "キャット"],
  ["ブリッジ", "お尻上げ"],
  ["肩甲骨", "けんこうこつ"],
];

/** 比較用に正規化（全角/半角・カタカナ→ひらがな・小文字） */
export const normalizeSearch = (s: string): string =>
  s
    .normalize("NFKC")
    .replace(/[\u30a1-\u30f6]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60))
    .toLowerCase();

const SYN = SEARCH_SYNONYMS.map((g) => g.map(normalizeSearch));

/** 検索語を区切る（空白・「の」「を」「と」「や」・読点） */
export function searchTokens(keyword: string): string[] {
  return normalizeSearch(keyword)
    .split(/[\s、,・]+|(?<=[\u4e00-\u9fff\u3041-\u3096ー])[のをとや](?=[\u4e00-\u9fff\u3041-\u3096ー])/)
    .map((t) => t.trim())
    .filter((t) => t.length > 0);
}

/** 1つの検索語を、同じ意味の言い換えに広げる */
const expand = (token: string): string[] => {
  const groups = SYN.filter((g) => g.includes(token));
  return groups.length ? [...new Set(groups.flat())] : [token];
};

/** キーワード・症状・部位で絞り込む（キーワードがあれば、運動名に一致するものを上に並べる） */
export function searchExercises(
  list: Exercise[],
  { keyword, symptom, part }: { keyword?: string; symptom?: string | null; part?: string | null },
): Exercise[] {
  const tokens = searchTokens(keyword ?? "");
  const scored: { e: Exercise; score: number; i: number }[] = [];
  list.forEach((e, i) => {
    if (symptom && !e.category.some((c) => c.slug === symptom)) return;
    if (part && !e.bodyPart.some((c) => c.slug === part)) return;
    if (tokens.length === 0) {
      scored.push({ e, score: 0, i });
      return;
    }
    const title = normalizeSearch(e.title);
    const tags = normalizeSearch(e.tags.join(" "));
    const other = normalizeSearch(
      [e.slug, e.purpose ?? "", ...e.category.map((c) => c.name ?? c.slug), ...e.bodyPart.map((c) => c.name ?? c.slug)].join(" "),
    );
    let score = 0;
    for (const t of tokens) {
      const words = expand(t);
      const s = words.some((w) => title.includes(w)) ? 3 : words.some((w) => tags.includes(w)) ? 2 : words.some((w) => other.includes(w)) ? 1 : 0;
      if (s === 0) return; // すべての検索語に一致するものだけ
      score += s;
    }
    scored.push({ e, score, i });
  });
  return scored.sort((a, b) => b.score - a.score || a.i - b.i).map((x) => x.e);
}
