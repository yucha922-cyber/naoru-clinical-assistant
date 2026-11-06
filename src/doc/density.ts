/**
 * 1枚に収めるための「詰め具合」。DocumentScreen が高さを測り、はみ出す場合は 0 → 1 → 2 と段階的に詰める。
 * それでも収まらない場合は、資料全体を縮小（zoom）して必ず1枚に収める。
 */
export const DENSITY = [
  { fig: "33mm", photo: "36mm", qr: 62, gap: "3.5mm", gapSm: "3mm", pad: "3mm", point: "10.5pt" },
  { fig: "28mm", photo: "28mm", qr: 54, gap: "2.5mm", gapSm: "2.2mm", pad: "2.4mm", point: "10pt" },
  { fig: "24mm", photo: "22mm", qr: 48, gap: "2mm", gapSm: "1.6mm", pad: "2mm", point: "9.5pt" },
] as const;
export type Density = 0 | 1 | 2;

/** 印刷時の1ページに収まる本文の高さ（A4 297mm − 上余白10mm − 下余白12mm）から、少し余裕を引いた値 */
export const PAGE_CONTENT_MM = 275;
export const FIT_TARGET_MM = 272;
/** これより小さくは縮小しない（文字が読めなくなるため）。これでも収まらない場合は2ページになる */
export const MIN_ZOOM = 0.6;
