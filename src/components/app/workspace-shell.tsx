"use client";

import type { ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";

import { AppSidebar } from "@/components/app/app-sidebar";
import { MobileHeader } from "@/components/app/mobile-header";
import { useSidebarState } from "@/components/app/sidebar-state-provider";
import type { IconName } from "@/components/ui/icon";

type MobileAction = {
  label: string;
  icon: IconName;
  href?: string;
  title?: string;
};

type RouteShellConfig = {
  activeNavLabel: string;
  mobileAction?: MobileAction;
  mobileSubtitle: string;
};

const publicRoutes = new Set(["/forgot-password", "/login", "/register", "/update-password"]);

const sectionConfig: Record<string, Omit<RouteShellConfig, "mobileAction">> = {
  accounts: { activeNavLabel: "Accounts", mobileSubtitle: "Accounts" },
  assets: { activeNavLabel: "Assets", mobileSubtitle: "Assets" },
  categories: { activeNavLabel: "Categories", mobileSubtitle: "Categories" },
  dashboard: { activeNavLabel: "Dashboard", mobileSubtitle: "Dashboard" },
  debts: { activeNavLabel: "Borrowing & Lending", mobileSubtitle: "Borrowing & Lending" },
  "future-planning": { activeNavLabel: "Future Planning", mobileSubtitle: "Future Planning" },
  notifications: { activeNavLabel: "Notifications", mobileSubtitle: "Notifications" },
  profile: { activeNavLabel: "Profile", mobileSubtitle: "Profile" },
  "savings-goals": { activeNavLabel: "Savings Goals", mobileSubtitle: "Savings Goals" },
  settings: { activeNavLabel: "Settings", mobileSubtitle: "Settings" },
  subscriptions: { activeNavLabel: "Subscriptions", mobileSubtitle: "Subscriptions" },
  transactions: { activeNavLabel: "Transactions", mobileSubtitle: "Transactions" },
};

const listActions: Record<string, MobileAction> = {
  accounts: { label: "Add account", icon: "plus", href: "/accounts/add", title: "Add account" },
  assets: { label: "Add asset", icon: "plus", href: "/assets/add", title: "Add asset" },
  categories: { label: "Add category", icon: "plus", href: "/categories/add", title: "Add category" },
  debts: { label: "Add record", icon: "plus", href: "/debts/add", title: "Add borrowing or lending" },
  "savings-goals": { label: "Create goal", icon: "plus", href: "/savings-goals/add", title: "Create savings goal" },
  subscriptions: { label: "Add subscription", icon: "plus", href: "/subscriptions/add", title: "Add subscription" },
  transactions: { label: "Add transaction", icon: "plus", href: "/transactions/add", title: "Add transaction" },
};

function routeShellConfig(pathname: string): RouteShellConfig {
  const [section = "dashboard", detail, nestedDetail] = pathname.split("/").filter(Boolean);
  const base = sectionConfig[section] ?? { activeNavLabel: "", mobileSubtitle: "FinancePro" };

  if (!detail) return { ...base, mobileAction: listActions[section] };
  if (section === "transactions" && detail === "import") return { ...base, mobileSubtitle: "Import Transactions" };
  if (detail === "add") {
    const addTitles: Record<string, string> = {
      accounts: "Add Account",
      assets: "Add Asset",
      categories: "Add Category",
      debts: "Add Borrowing or Lending",
      "future-planning": "Add Future Plan",
      "savings-goals": "Create Savings Goal",
      subscriptions: "Add Subscription",
      transactions: "Add Transaction",
    };
    return { ...base, mobileSubtitle: addTitles[section] ?? base.mobileSubtitle };
  }
  if (nestedDetail === "edit") {
    const editTitles: Record<string, string> = {
      accounts: "Edit Account",
      assets: "Edit Asset",
      categories: "Edit Category",
      debts: "Edit Borrowing or Lending",
      "future-planning": "Edit Future Plan",
      "savings-goals": "Edit Goal",
      subscriptions: "Edit Subscription",
      transactions: "Edit Transaction",
    };
    return { ...base, mobileSubtitle: editTitles[section] ?? base.mobileSubtitle };
  }
  return base;
}

export function WorkspaceShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { isSidebarCollapsed, toggleSidebar } = useSidebarState();
  const [isMobileNavigationOpen, setIsMobileNavigationOpen] = useState(false);
  const mobileNavigationRef = useRef<HTMLDivElement>(null);
  const routeConfig = routeShellConfig(pathname);
  const isPublicRoute = publicRoutes.has(pathname) || pathname.startsWith("/auth/");

  useEffect(() => {
    const desktopViewport = window.matchMedia("(min-width: 1024px)");
    const closeNavigationOnDesktop = (event: MediaQueryListEvent) => {
      if (event.matches) setIsMobileNavigationOpen(false);
    };

    desktopViewport.addEventListener("change", closeNavigationOnDesktop);
    return () => desktopViewport.removeEventListener("change", closeNavigationOnDesktop);
  }, []);

  useEffect(() => {
    if (!isMobileNavigationOpen) return;

    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousBodyOverflow = document.body.style.overflow;
    const focusableSelector = 'a[href], button:not([disabled]):not([tabindex="-1"])';
    const focusFrame = window.requestAnimationFrame(() => {
      mobileNavigationRef.current?.querySelector<HTMLElement>(focusableSelector)?.focus();
    });

    document.body.style.overflow = "hidden";

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        setIsMobileNavigationOpen(false);
        return;
      }

      if (event.key !== "Tab") return;
      const focusableElements = Array.from(
        mobileNavigationRef.current?.querySelectorAll<HTMLElement>(focusableSelector) ?? [],
      );
      if (focusableElements.length === 0) return;

      const firstElement = focusableElements[0];
      const lastElement = focusableElements.at(-1);
      if (event.shiftKey && document.activeElement === firstElement) {
        event.preventDefault();
        lastElement?.focus();
      } else if (!event.shiftKey && document.activeElement === lastElement) {
        event.preventDefault();
        firstElement.focus();
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      window.cancelAnimationFrame(focusFrame);
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousBodyOverflow;
      if (previouslyFocused?.isConnected) previouslyFocused.focus();
    };
  }, [isMobileNavigationOpen]);

  if (isPublicRoute) return children;

  return (
    <div className="min-h-dvh bg-[#f8f9ff] text-[#0b1c30]">
      <div className="flex min-h-dvh min-w-0">
        <AppSidebar activeLabel={routeConfig.activeNavLabel} collapsed={isSidebarCollapsed} onToggleCollapse={toggleSidebar} />

        {isMobileNavigationOpen ? (
          <div
            aria-label="Main navigation"
            aria-modal="true"
            className="fixed inset-0 z-40 lg:hidden"
            ref={mobileNavigationRef}
            role="dialog"
          >
            <button
              aria-hidden="true"
              className="absolute inset-0 h-full w-full bg-[#0b1c30]/40"
              onClick={() => setIsMobileNavigationOpen(false)}
              tabIndex={-1}
              type="button"
            />
            <AppSidebar activeLabel={routeConfig.activeNavLabel} onClose={() => setIsMobileNavigationOpen(false)} variant="mobile" />
          </div>
        ) : null}

        <div className="flex min-w-0 flex-1 flex-col">
          <MobileHeader
            action={routeConfig.mobileAction}
            isNavigationOpen={isMobileNavigationOpen}
            onOpenNavigation={() => setIsMobileNavigationOpen(true)}
            subtitle={routeConfig.mobileSubtitle}
          />
          <main className="mx-auto min-w-0 w-full max-w-[1440px] flex-1 pb-[max(1.5rem,env(safe-area-inset-bottom))] pl-[max(1rem,env(safe-area-inset-left))] pr-[max(1rem,env(safe-area-inset-right))] pt-6 sm:pl-[max(1.25rem,env(safe-area-inset-left))] sm:pr-[max(1.25rem,env(safe-area-inset-right))] md:pl-[max(1.5rem,env(safe-area-inset-left))] md:pr-[max(1.5rem,env(safe-area-inset-right))] lg:py-8 lg:pl-[max(2rem,env(safe-area-inset-left))] lg:pr-[max(2rem,env(safe-area-inset-right))]">{children}</main>
        </div>
      </div>
    </div>
  );
}
