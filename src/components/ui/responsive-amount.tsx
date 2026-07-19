import type { CSSProperties, ReactNode } from "react";

export function ResponsiveAmount({
  children,
  className = "",
  maxSizeRem = 2,
  minSizeRem = 1,
}: {
  children: ReactNode;
  className?: string;
  maxSizeRem?: number;
  minSizeRem?: number;
}) {
  const displayText = String(children ?? "");
  const readableMinSizeRem = Math.max(1, minSizeRem);
  const readableMaxSizeRem = Math.max(readableMinSizeRem, maxSizeRem);
  const style = {
    fontSize: `clamp(${readableMinSizeRem}rem, calc(${readableMinSizeRem}rem + 0.65vw), ${readableMaxSizeRem}rem)`,
    lineHeight: 1.2,
  } satisfies CSSProperties;

  return (
    <span className={`amount-value block max-w-full ${className}`} style={style} title={displayText}>
      {children}
    </span>
  );
}
