import { useEffect, useState } from "react";
import QRCode from "qrcode";

// QRコードは端末内（ブラウザ内）で生成し、外部サービスは使いません。
const cache = new Map<string, string>();
const failed = new Set<string>();

export type QrState = { dataUrl: string | null; error: boolean };

export function useQrCode(url: string | null): QrState {
  // 生成完了を知らせるためのカウンタ（値自体は使わない）
  const [, setVersion] = useState(0);

  useEffect(() => {
    if (!url || cache.has(url) || failed.has(url)) return;
    let alive = true;
    QRCode.toDataURL(url, { errorCorrectionLevel: "M", margin: 1, width: 240, color: { dark: "#14213d" } })
      .then((d) => cache.set(url, d))
      .catch(() => failed.add(url))
      .finally(() => alive && setVersion((v) => v + 1));
    return () => {
      alive = false;
    };
  }, [url]);

  if (!url) return { dataUrl: null, error: false };
  return { dataUrl: cache.get(url) ?? null, error: failed.has(url) };
}
