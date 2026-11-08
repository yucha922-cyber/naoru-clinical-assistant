/**
 * 患者説明資料の「詰め具合」。
 * 写真・イラスト・余白を1段階小さくすると印刷のページ数が減る場合だけ小さくする（0 → 1）。
 * 文字は小さくしない（本文 10〜10.5pt）。内容が多い場合は無理に詰めず、複数ページにする。
 * 運動カードはページの途中で分かれない（break-inside: avoid）。
 */
export const DENSITY = [
  { fig: "22mm", photo: "34mm", photoWide: "40mm", qr: 92, qrWide: 100, gap: "3mm", gapSm: "2.6mm", pad: "2.6mm" },
  { fig: "19mm", photo: "28mm", photoWide: "34mm", qr: 86, qrWide: 92, gap: "2.4mm", gapSm: "2mm", pad: "2.2mm" },
] as const;
export type Density = 0 | 1;

/** 印刷時の1ページに収まる本文の高さ（A4 297mm − 上余白10mm − 下余白12mm） */
export const PAGE_CONTENT_MM = 275;
/** ページ分割の計算に使う高さ（印刷範囲 275mm から、計算の誤差分として 1mm 引く） */
export const FIT_TARGET_MM = 274;

type Block = { top: number; bottom: number; keepWithNext: boolean };

/**
 * 印刷時のページ数を求める（ブラウザの改ページと同じ考え方）。
 * - [data-block] の要素は途中で分けない（入りきらなければ次のページへ送る）
 * - 同じ高さに並ぶカード（2列の行）はまとめて1つとして扱う
 * - data-block="keep-with-next"（見出し）は次の要素と一緒に送る
 * @param pxToMm 画面のピクセルを mm に直す係数
 */
export function countPages(content: HTMLElement, pxToMm: number, pageMm = FIT_TARGET_MM): number {
  const origin = content.getBoundingClientRect().top;
  const raw: Block[] = Array.from(content.querySelectorAll<HTMLElement>("[data-block]")).map((el) => {
    const r = el.getBoundingClientRect();
    return { top: (r.top - origin) * pxToMm, bottom: (r.bottom - origin) * pxToMm, keepWithNext: el.dataset.block === "keep-with-next" };
  });
  // 同じ行（top がほぼ同じ）をまとめる
  const rows: Block[] = [];
  for (const b of raw) {
    const last = rows[rows.length - 1];
    if (last && Math.abs(last.top - b.top) < 0.5) last.bottom = Math.max(last.bottom, b.bottom);
    else rows.push({ ...b });
  }
  // 見出しは次の行とまとめる
  const blocks: Block[] = [];
  for (let i = 0; i < rows.length; i++) {
    const b = rows[i];
    if (b.keepWithNext && rows[i + 1]) {
      blocks.push({ top: b.top, bottom: rows[i + 1].bottom, keepWithNext: false });
      i++;
    } else blocks.push(b);
  }
  let pages = 1;
  let pageStart = 0;
  for (const b of blocks) {
    if (b.bottom - pageStart > pageMm && b.top > pageStart + 0.5) {
      pages++;
      pageStart = b.top;
    }
  }
  return pages;
}

/** 文字サイズ（印刷物として読みやすい大きさ。縮小しない） */
export const FONT = {
  body: "10.5pt",
  sub: "10pt",
  caution: "9pt",
  caption: "8pt",
} as const;
