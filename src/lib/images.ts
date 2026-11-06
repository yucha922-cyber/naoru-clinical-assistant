/** 指定した要素内の画像の読み込み完了を待ち、失敗・未完了の枚数を返す（印刷前チェック用） */
export async function waitForImages(root: HTMLElement, timeoutMs: number): Promise<{ failed: number; pending: number }> {
  const imgs = Array.from(root.querySelectorAll("img"));
  const settle = (img: HTMLImageElement) =>
    img.complete
      ? Promise.resolve()
      : new Promise<void>((resolve) => {
          img.addEventListener("load", () => resolve(), { once: true });
          img.addEventListener("error", () => resolve(), { once: true });
        });
  await Promise.race([
    Promise.all(imgs.map(settle)),
    new Promise((r) => setTimeout(r, timeoutMs)),
  ]);
  const pending = imgs.filter((i) => !i.complete).length;
  const failed = imgs.filter((i) => i.complete && i.naturalWidth === 0).length;
  // 読み込み失敗で置き換え済みの枠も数える
  const replaced = root.querySelectorAll("[data-broken-image]").length;
  return { failed: failed + replaced, pending };
}
