import { useState } from "react";
import { useApp } from "../state";

/**
 * selfexercise の公式画像を表示する。読み込みに失敗したら画面に知らせ、印刷前チェックに反映する。
 * 縦横比は維持（object-contain）。
 */
export function ExerciseImage({
  url,
  alt,
  className = "",
}: {
  url: string;
  alt: string;
  className?: string;
}) {
  const { reportBrokenImage } = useApp();
  const [failed, setFailed] = useState(false);
  if (failed) {
    return (
      <div
        className={`flex items-center justify-center bg-red-50 p-2 text-center text-[11px] font-medium text-red-700 ring-1 ring-red-200 ${className}`}
        data-broken-image={url}
      >
        画像を読み込めません
      </div>
    );
  }
  return (
    <img
      src={url}
      alt={alt}
      loading="eager"
      decoding="async"
      referrerPolicy="no-referrer"
      className={`object-contain ${className}`}
      onError={() => {
        setFailed(true);
        reportBrokenImage(url);
      }}
    />
  );
}

export function NoImage({ className = "" }: { className?: string }) {
  return (
    <div className={`flex items-center justify-center bg-navy-50 text-xs text-slate-400 ${className}`}>
      画像なし
    </div>
  );
}
