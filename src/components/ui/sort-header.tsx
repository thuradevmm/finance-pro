import { Icon } from "@/components/ui/icon";

export type SortDirection = "asc" | "desc";

export function compareSortValues(firstValue: number | string, secondValue: number | string, direction: SortDirection) {
  const result = typeof firstValue === "number" && typeof secondValue === "number"
    ? firstValue - secondValue
    : String(firstValue).localeCompare(String(secondValue));
  return direction === "asc" ? result : -result;
}

export function SortHeader({
  align = "left",
  children,
  onSort,
  sortDirection,
}: {
  align?: "left" | "right";
  children: string;
  onSort: () => void;
  sortDirection?: SortDirection;
}) {
  return (
    <button
      className={`inline-flex w-full items-center gap-1 text-xs font-semibold text-[#45464d] transition hover:text-[#0b1c30] ${align === "right" ? "justify-end" : "justify-start"}`}
      onClick={onSort}
      type="button"
    >
      {children}
      <Icon className={`size-3 transition ${sortDirection === "asc" ? "rotate-180" : ""} ${sortDirection ? "text-[#0058be]" : "text-[#a1a1aa]"}`} name="chevronDown" />
    </button>
  );
}
