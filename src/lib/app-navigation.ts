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
    { label: "Budgets", icon: "savings", href: "/budgets" },
  ],
  [
    { label: "Future Planning", icon: "timeline", href: "/future-planning" },
    { label: "Scenario Budgeting", icon: "chart", href: "/scenario-budgeting" },
    { label: "Savings Goals", icon: "target", href: "/savings-goals" },
    { label: "Debts", icon: "credit", href: "/debts" },
  ],
  [
    { label: "Subscriptions", icon: "subscriptions", href: "/subscriptions" },
    { label: "People Payments", icon: "users", href: "/people-payments" },
    { label: "Assets", icon: "box", href: "/assets" },
    { label: "Reports", icon: "chart", href: "/reports" },
    { label: "Documents", icon: "document", href: "/documents" },
  ],
  [
    { label: "Settings", icon: "settings", href: "/settings" },
  ],
];
