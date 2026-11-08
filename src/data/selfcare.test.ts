import { describe, expect, it } from "vitest";
import { SELFCARE, SEARCH_SYNONYMS, findExercise, searchExercises } from "./selfcare";

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

describe("検索の改善（言い換え・表記ゆれ）", () => {
  const titles = (k: string) => searchExercises(SELFCARE.exercises, { keyword: k }).map((e) => e.title);
  it("「胸筋」「大胸筋」「胸のストレッチ」で胸筋ストレッチが先頭に出る", () => {
    expect(titles("胸筋")[0]).toBe("胸筋ストレッチ");
    expect(titles("大胸筋")).toContain("胸筋ストレッチ");
    expect(titles("胸のストレッチ")[0]).toBe("胸筋ストレッチ");
  });
  it("言い換え（太もも裏・あご引き・カーフ）とカタカナ／ひらがなの違いを吸収する", () => {
    expect(titles("太もも裏")).toContain("ハムストリングスストレッチ");
    expect(titles("あご引き")).toContain("顎引きエクササイズ");
    expect(titles("カーフ")).toContain("ふくらはぎストレッチ");
    expect(titles("すとれっち").length).toBe(titles("ストレッチ").length);
  });
  it("医学的に異なるものは同じ扱いにしない（大胸筋で小胸筋を探さない・胸筋で腸腰筋を出さない）", () => {
    expect(SEARCH_SYNONYMS.flat()).not.toContain("小胸筋");
    expect(titles("大胸筋")).not.toContain("腸腰筋ストレッチ");
  });
  it("すべての検索語に一致するものだけを出す", () => {
    expect(titles("胸 ふくらはぎ")).toEqual([]);
  });
});
