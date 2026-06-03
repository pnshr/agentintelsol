import { useEffect, useRef, useState, type ReactNode } from "react";

interface ChartFrameProps {
  children: (size: { width: number; height: number }) => ReactNode;
  className?: string;
}

export function ChartFrame({ children, className = "" }: ChartFrameProps) {
  const frameRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });

  useEffect(() => {
    const node = frameRef.current;

    if (!node) {
      return;
    }

    const updateSize = () => {
      const rect = node.getBoundingClientRect();
      setSize({
        width: Math.floor(rect.width),
        height: Math.floor(rect.height)
      });
    };

    updateSize();

    if (typeof ResizeObserver === "undefined") {
      const frame = window.requestAnimationFrame(updateSize);
      return () => window.cancelAnimationFrame(frame);
    }

    const observer = new ResizeObserver(updateSize);
    observer.observe(node);

    return () => observer.disconnect();
  }, []);

  return (
    <div ref={frameRef} className={`relative min-h-0 min-w-0 ${className}`}>
      {size.width > 0 && size.height > 0 ? (
        children(size)
      ) : (
        <div className="absolute inset-0 rounded-lg border border-white/10 bg-white/[0.035]" aria-hidden="true" />
      )}
    </div>
  );
}
