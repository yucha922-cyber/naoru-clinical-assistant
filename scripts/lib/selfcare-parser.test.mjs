import { describe, expect, it } from "vitest";
import { buildExercise, orderImages, parseCategories, parseFreeSlugs, parseSelfCareMarkdown, youtubeUrl } from "./selfcare-parser.mjs";

const MD = `---
title: テスト種目
order: 3
difficulty: 2
symptoms: katakori, nekoze
parts: kata
tags: ストレッチ、胸
youtube: https://youtu.be/abcdefghijk
---

## 目的
胸を伸ばします。

## 実施方法
- 手順1
- 手順2

## 注意点
- 痛みが出たら中止
`;

describe("parseSelfCareMarkdown", () => {
  it("frontmatter と見出しを読み取り、無い値は null にする（推測で埋めない）", () => {
    const p = parseSelfCareMarkdown(MD, "x.md");
    expect(p.title).toBe("テスト種目");
    expect(p.steps).toEqual(["手順1", "手順2"]);
    expect(p.cautions).toEqual(["痛みが出たら中止"]);
    expect(p.purpose).toBe("胸を伸ばします。");
    expect(p.tags).toEqual(["ストレッチ", "胸"]);
    expect(p.duration).toBeNull(); // selfexercise 側は「約3分」を既定にするが、ここでは補わない
    expect(p.difficulty).toBe(2);
  });
  it("frontmatter が無いとエラー", () => {
    expect(() => parseSelfCareMarkdown("# hello", "x.md")).toThrow();
  });
});

describe("orderImages", () => {
  it("手順 → 開始/終了/ダメな例 → その他 の順。日本語の説明を読み取る", () => {
    const r = orderImages(["ng_肩がすくむ.jpg", "end.jpg", "start.jpg", ".gitkeep", "movie.mp4", "zz.png"]);
    expect(r.map((i) => i.label)).toEqual(["開始姿勢", "終了姿勢", "ダメな例", null]);
    expect(r[2].caption).toBe("肩がすくむ");
    const s = orderImages(["step2_丸める.jpg", "step1_開始姿勢.jpg"]);
    expect(s.map((i) => i.label)).toEqual(["①", "②"]);
  });
});

describe("categories / free slugs", () => {
  it("categories.ts から抽出", () => {
    const c = parseCategories(`export const SYMPTOMS: Category[] = [\n { slug: "a", name: "A" },\n];\nexport const PARTS: Category[] = [\n { slug: "b", name: "B" },\n];`);
    expect(c).toEqual({ symptoms: [{ slug: "a", name: "A" }], parts: [{ slug: "b", name: "B" }] });
    expect(parseFreeSlugs(`recommendedSlugs: ["x", "y"],`)).toEqual(["x", "y"]);
  });
});

describe("buildExercise", () => {
  it("要求フィールドを持つレコードを作る", () => {
    const parsed = parseSelfCareMarkdown(MD, "t.md");
    const ex = buildExercise({
      slug: "t",
      parsed,
      imageFiles: ["start.jpg", "step1_開始.jpg"],
      folderFiles: ["start.jpg", "step1_開始.jpg"],
      categories: { symptoms: [{ slug: "katakori", name: "肩こり" }], parts: [] },
      freeSlugs: ["t"],
      siteBase: "https://example.com/se",
    });
    expect(Object.keys(ex)).toEqual(
      expect.arrayContaining(["id", "slug", "title", "category", "bodyPart", "purpose", "instructions", "precautions", "duration", "imageUrls", "videoUrl", "detailUrl"]),
    );
    expect(ex.category).toEqual([{ slug: "katakori", name: "肩こり" }, { slug: "nekoze", name: null }]);
    expect(ex.imageUrls[0]).toBe("https://example.com/se/images/t/step1_%E9%96%8B%E5%A7%8B.jpg");
    expect(ex.detailUrl).toBe("https://example.com/se/selfcare/t/");
    expect(ex.videoUrl).toBe("https://youtu.be/abcdefghijk");
    expect(ex.requiresMemberCode).toBe(false);
  });
  it("youtubeUrl は ID も URL も受け付け、それ以外は null", () => {
    expect(youtubeUrl("abcdefghijk")).toBe("https://youtu.be/abcdefghijk");
    expect(youtubeUrl("")).toBeNull();
    expect(youtubeUrl("???")).toBeNull();
  });
});
