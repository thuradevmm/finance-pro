"use client";

import { createContext, type ReactNode, useContext, useState } from "react";

import { sidebarCollapsedCookieName, sidebarCollapsedStorageKey } from "@/lib/sidebar-state";

type SidebarState = {
  isSidebarCollapsed: boolean;
  toggleSidebar: () => void;
};

const SidebarStateContext = createContext<SidebarState | null>(null);

function persistSidebarState(collapsed: boolean) {
  window.localStorage.setItem(sidebarCollapsedStorageKey, String(collapsed));
  document.cookie = `${sidebarCollapsedCookieName}=${collapsed}; path=/; max-age=31536000; samesite=lax`;
}

export function SidebarStateProvider({
  children,
  initialCollapsed,
}: {
  children: ReactNode;
  initialCollapsed: boolean;
}) {
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(initialCollapsed);

  function toggleSidebar() {
    setIsSidebarCollapsed((current) => {
      const nextCollapsed = !current;
      persistSidebarState(nextCollapsed);
      return nextCollapsed;
    });
  }

  return (
    <SidebarStateContext.Provider value={{ isSidebarCollapsed, toggleSidebar }}>
      {children}
    </SidebarStateContext.Provider>
  );
}

export function useSidebarState() {
  const context = useContext(SidebarStateContext);
  if (!context) {
    throw new Error("useSidebarState must be used inside SidebarStateProvider.");
  }
  return context;
}

export function useOptionalSidebarState() {
  return useContext(SidebarStateContext);
}
