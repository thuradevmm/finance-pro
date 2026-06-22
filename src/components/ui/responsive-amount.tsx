import { Children, type CSSProperties, type ReactNode } from "react";

export function ResponsiveAmount({
  children,
  className = "",
  maxSizeRem = 3,
  minSizeRem = 0.75,
}: {
  children: ReactNode;
  className?: string;
  maxSizeRem?: number;
  minSizeRem?: number;
}) {
  const displayText = Children.toArray(children).join("");
  const compactLength = displayText.replace(/\s/g, "").length;
  const fontSize = Math.max(minSizeRem, Math.min(maxSizeRem, (maxSizeRem * 13) / Math.max(compactLength, 13)));
  const style = { fontSize: `${fontSize}rem`, lineHeight: 1.15 } satisfies CSSProperties;

  return (
    <span className={`amount-value block max-w-full overflow-hidden ${className}`} style={style} title={displayText}>
      {children}
    </span>
  );
}
