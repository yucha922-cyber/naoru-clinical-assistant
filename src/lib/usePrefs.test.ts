import { describe, expect, it } from "vitest";
import { PREFS_KEY, loadPrefs } from "./usePrefs";

const storeWith = (value: unknown) => ({ getItem: (k: string) => (k === PREFS_KEY ? JSON.stringify(value) : null) });

describe("セルフケアの設定（お気に入り・最近使った運動）", () => {
  it("ライブラリに実在する運動IDだけを読み込む（患者情報などの文字列は捨てる）", () => {
    const p = loadPrefs(storeWith({ favorites: ["kata-chest-stretch", "架空 花子", "主訴：首の張り", "no-such-exercise", 123], recent: ["kubi-chin-tuck"] }));
    expect(p).toEqual({ favorites: ["kata-chest-stretch"], recent: ["kubi-chin-tuck"] });
  });
  it("壊れたデータ・未保存でも空の設定になる", () => {
    expect(loadPrefs({ getItem: () => "{壊れたJSON" })).toEqual({ favorites: [], recent: [] });
    expect(loadPrefs({ getItem: () => null })).toEqual({ favorites: [], recent: [] });
  });
});
