"use client";

import type { ReactNode } from "react";
import { useEffect, useRef, useState } from "react";

import { AppSidebar } from "@/components/app/app-sidebar";
import { AppTopBar } from "@/components/app/app-top-bar";
import { MobileHeader } from "@/components/app/mobile-header";
import { useSidebarState } from "@/components/app/sidebar-state-provider";
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
  mobileSubtitle,
  mobileAction,
}: AppShellProps) {
  const { isSidebarCollapsed, toggleSidebar } = useSidebarState();
  const [isMobileNavigationOpen, setIsMobileNavigationOpen] = useState(false);
  const mobileNavigationRef = useRef<HTMLDivElement>(null);

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

  return (
    <div className="min-h-dvh bg-[#f8f9ff] text-[#0b1c30]">
      <div className="flex min-h-dvh min-w-0">
        <AppSidebar activeLabel={activeNavLabel} collapsed={isSidebarCollapsed} onToggleCollapse={toggleSidebar} />

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
            <AppSidebar activeLabel={activeNavLabel} onClose={() => setIsMobileNavigationOpen(false)} variant="mobile" />
          </div>
        ) : null}

        <div className="flex min-w-0 flex-1 flex-col">
          <MobileHeader
            action={mobileAction}
            isNavigationOpen={isMobileNavigationOpen}
            onOpenNavigation={() => setIsMobileNavigationOpen(true)}
            subtitle={mobileSubtitle}
          />
          <AppTopBar />

          <main className="mx-auto min-w-0 w-full max-w-[1440px] flex-1 pb-[max(1.5rem,env(safe-area-inset-bottom))] pl-[max(1rem,env(safe-area-inset-left))] pr-[max(1rem,env(safe-area-inset-right))] pt-6 sm:pl-[max(1.25rem,env(safe-area-inset-left))] sm:pr-[max(1.25rem,env(safe-area-inset-right))] md:pl-[max(1.5rem,env(safe-area-inset-left))] md:pr-[max(1.5rem,env(safe-area-inset-right))] lg:py-8 lg:pl-[max(2rem,env(safe-area-inset-left))] lg:pr-[max(2rem,env(safe-area-inset-right))]">{children}</main>
        </div>
      </div>
    </div>
  );
}
