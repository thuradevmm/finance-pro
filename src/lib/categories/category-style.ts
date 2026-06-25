import type { IconName } from "@/components/ui/icon";
import type { CategoryType, FinancialCategory } from "@/types/finance";

export type CategoryStyle = Pick<FinancialCategory, "bg" | "marker" | "tone"> & {
  color: string;
  icon: IconName;
};

export const categoryTypeStyles: Record<CategoryType, CategoryStyle> = {
  Account: {
    bg: "bg-[#eff6ff]",
    color: "Blue",
    icon: "account",
    marker: "bg-[#2170e4]",
    tone: "text-[#0058be]",
  },
  Asset: {
    bg: "bg-[#f8f9ff]",
    color: "Gray",
    icon: "box",
    marker: "bg-[#76777d]",
    tone: "text-[#45464d]",
  },
  Debt: {
    bg: "bg-[#fffbeb]",
    color: "Amber",
    icon: "credit",
    marker: "bg-[#92400e]",
    tone: "text-[#92400e]",
  },
  Expense: {
    bg: "bg-[#fff1f0]",
    color: "Red",
    icon: "trendingDown",
    marker: "bg-[#b42318]",
    tone: "text-[#b42318]",
  },
  Income: {
    bg: "bg-[#ecfdf5]",
    color: "Green",
    icon: "trendingUp",
    marker: "bg-[#047857]",
    tone: "text-[#047857]",
  },
  "Savings Goal": {
    bg: "bg-[#eef2ff]",
    color: "Indigo",
    icon: "target",
    marker: "bg-[#4f46e5]",
    tone: "text-[#4f46e5]",
  },
  Subscription: {
    bg: "bg-[#faf5ff]",
    color: "Purple",
    icon: "subscriptions",
    marker: "bg-[#7e22ce]",
    tone: "text-[#7e22ce]",
  },
};

export function getCategoryTypeStyle(type: CategoryType) {
  return categoryTypeStyles[type];
}
