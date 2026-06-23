"use client";

import type { ReactNode } from "react";
import { useState } from "react";

import { AppSidebar } from "@/components/app/app-sidebar";
import { AppTopBar } from "@/components/app/app-top-bar";
import { MobileHeader } from "@/components/app/mobile-header";
import type { IconName } from "@/components/ui/icon";

type AppShellProps = {
  activeNavLabel: string;
  children: ReactNode;
  topSearchLabel?: string;
  topSearchPlaceholder?: string;
  mobileSubtitle: string;
  mobileSearchLabel?: string;
  mobileSearchPlaceholder?: string;
  mobileAction?: {
    label: string;
    icon: IconName;
    href?: string;
    title?: string;
  };
};

export function AppShell({
  activeNavLabel,
  children,
  topSearchLabel,
  topSearchPlaceholder,
  mobileSubtitle,
  mobileSearchLabel,
  mobileSearchPlaceholder,
  mobileAction,
}: AppShellProps) {
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isMobileNavigationOpen, setIsMobileNavigationOpen] = useState(false);

  function toggleSidebar() {
    setIsSidebarCollapsed((current) => !current);
  }

  return (
    <div className="min-h-screen bg-[#f8f9ff] text-[#0b1c30]">
      <div className="flex min-h-screen">
        <AppSidebar activeLabel={activeNavLabel} collapsed={isSidebarCollapsed} onToggleCollapse={toggleSidebar} />

        {isMobileNavigationOpen ? (
          <div className="fixed inset-0 z-40 md:hidden" role="presentation">
            <button
              aria-label="Close navigation"
              className="absolute inset-0 h-full w-full bg-[#0b1c30]/40"
              onClick={() => setIsMobileNavigationOpen(false)}
              type="button"
            />
            <AppSidebar activeLabel={activeNavLabel} onClose={() => setIsMobileNavigationOpen(false)} variant="mobile" />
          </div>
        ) : null}

        <div className="flex min-w-0 flex-1 flex-col">
          <MobileHeader
            action={mobileAction}
            onOpenNavigation={() => setIsMobileNavigationOpen(true)}
            searchLabel={mobileSearchLabel}
            searchPlaceholder={mobileSearchPlaceholder}
            subtitle={mobileSubtitle}
          />
          <AppTopBar
            onToggleSidebar={toggleSidebar}
            searchLabel={topSearchLabel}
            searchPlaceholder={topSearchPlaceholder}
            sidebarCollapsed={isSidebarCollapsed}
          />

          <main className="mx-auto w-full max-w-[1440px] flex-1 px-4 py-6 md:px-8 md:py-8">{children}</main>
        </div>
      </div>
    </div>
  );
}
