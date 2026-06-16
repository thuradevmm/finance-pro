import type { IconName } from "@/components/ui/icon";

export type NavItem = {
  label: string;
  icon: IconName;
  href: string;
};

export const navGroups: NavItem[][] = [
  [
    { label: "Dashboard", icon: "dashboard", href: "#" },
    { label: "Transactions", icon: "receipt", href: "/transactions" },
    { label: "Accounts", icon: "account", href: "/accounts" },
    { label: "Categories", icon: "category", href: "#" },
    { label: "Budgets", icon: "savings", href: "#" },
  ],
  [
    { label: "Future Planning", icon: "timeline", href: "#" },
    { label: "Scenario Budgeting", icon: "chart", href: "#" },
    { label: "Savings Goals", icon: "target", href: "#" },
    { label: "Debts", icon: "credit", href: "#" },
  ],
  [
    { label: "Subscriptions", icon: "subscriptions", href: "#" },
    { label: "People Payments", icon: "users", href: "#" },
    { label: "Assets", icon: "box", href: "#" },
    { label: "Reports", icon: "chart", href: "#" },
    { label: "Documents", icon: "document", href: "#" },
    { label: "Settings", icon: "settings", href: "#" },
  ],
];
