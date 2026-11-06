import { useEffect, useRef, useState, type ReactNode } from "react";

/**
 * 中身（A4の資料プレビュー）を、表示エリアの幅に収まるよう縮小して表示する。
 * 横スクロールせずに資料全体を確認できるようにするためのもの。
 * 印刷時は縮小を解除する（index.css の .fit-to-width）。
 */
export function FitToWidth({ children }: { children: ReactNode }) {
  const outerRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const [height, setHeight] = useState<number | undefined>(undefined);

  useEffect(() => {
    const outer = outerRef.current;
    const inner = innerRef.current;
    if (!outer || !inner) return;
    const update = () => {
      const natural = inner.scrollWidth;
      const available = outer.clientWidth;
      const s = natural > 0 ? Math.min(1, available / natural) : 1;
      setScale(s);
      setHeight(inner.offsetHeight * s);
    };
    const ro = new ResizeObserver(update);
    ro.observe(outer);
    ro.observe(inner);
    update();
    return () => ro.disconnect();
  }, []);

  return (
    <div ref={outerRef} className="fit-to-width w-full overflow-hidden" style={{ height }} data-preview-scale={scale.toFixed(3)}>
      <div ref={innerRef} className="fit-to-width-inner mx-auto w-max" style={{ transform: `scale(${scale})`, transformOrigin: "top left" }}>
        {children}
      </div>
    </div>
  );
}
