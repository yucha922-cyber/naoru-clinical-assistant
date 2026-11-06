import { describe, expect, it } from "vitest";
import { SELFCARE, findExercise, searchExercises } from "./selfcare";

describe("selfcare.json（selfexercise から生成）", () => {
  it("スキーマ検証に通り、種目がある", () => {
    expect(SELFCARE.exercises.length).toBeGreaterThan(0);
  });
  it("slug が重複しない・id と slug が一致", () => {
    const slugs = SELFCARE.exercises.map((e) => e.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    SELFCARE.exercises.forEach((e) => expect(e.id).toBe(e.slug));
  });
  it("画像URL・詳細URLが公開サイトを指す", () => {
    for (const e of SELFCARE.exercises) {
      expect(e.detailUrl).toBe(`${SELFCARE.source.site}/selfcare/${e.slug}/`);
      e.images.forEach((img) => {
        expect(img.url.startsWith(`${SELFCARE.source.site}/images/${e.slug}/`)).toBe(true);
        expect(img.path.startsWith(`public/images/${e.slug}/`)).toBe(true);
      });
      expect(e.imageUrls).toEqual(e.images.map((i) => i.url));
    }
  });
  it("存在しない運動IDは undefined", () => {
    expect(findExercise("does-not-exist")).toBeUndefined();
  });
  it("キーワード・症状・部位で検索できる", () => {
    expect(searchExercises(SELFCARE.exercises, { keyword: "胸筋" }).map((e) => e.slug)).toContain("kata-chest-stretch");
    const kata = searchExercises(SELFCARE.exercises, { symptom: "katakori" });
    expect(kata.length).toBeGreaterThan(0);
    kata.forEach((e) => expect(e.category.some((c) => c.slug === "katakori")).toBe(true));
    const hiza = searchExercises(SELFCARE.exercises, { part: "hiza" });
    hiza.forEach((e) => expect(e.bodyPart.some((c) => c.slug === "hiza")).toBe(true));
    expect(searchExercises(SELFCARE.exercises, { keyword: "zzzz存在しない" })).toEqual([]);
  });
});
