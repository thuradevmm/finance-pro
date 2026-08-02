import type { IconName } from "@/components/ui/icon";

export type NavItem = {
  label: string;
  icon: IconName;
  href: string;
};

export const navGroups: NavItem[][] = [
  [
    { label: "Dashboard", icon: "dashboard", href: "/dashboard" },
    { label: "Transactions", icon: "receipt", href: "/transactions" },
    { label: "Accounts", icon: "account", href: "/accounts" },
    { label: "Categories", icon: "category", href: "/categories" },
  ],
  [
    { label: "Future Planning", icon: "timeline", href: "/future-planning" },
    { label: "Savings Goals", icon: "target", href: "/savings-goals" },
    { label: "Borrowing & Lending", icon: "credit", href: "/debts" },
  ],
  [
    { label: "Subscriptions", icon: "subscriptions", href: "/subscriptions" },
    { label: "Assets", icon: "box", href: "/assets" },
  ],
];
