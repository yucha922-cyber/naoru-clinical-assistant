import { useQrCode } from "../lib/useQrCode";

export function QrCode({ url, size = 88, label }: { url: string; size?: number; label?: string }) {
  const { dataUrl, error } = useQrCode(url);
  if (error) {
    return (
      <div className="flex items-center justify-center bg-red-50 text-[10px] text-red-700" style={{ width: size, height: size }} data-qr-error>
        QR生成失敗
      </div>
    );
  }
  return dataUrl ? (
    <img src={dataUrl} width={size} height={size} alt={label ?? `QRコード: ${url}`} data-qr={url} />
  ) : (
    <div className="animate-pulse bg-navy-50" style={{ width: size, height: size }} />
  );
}
