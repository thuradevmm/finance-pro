"use client";

import { usePathname } from "next/navigation";

import { useIsInteractionLoading } from "@/components/app/interaction-loading-provider";
import { useOptionalSidebarState } from "@/components/app/sidebar-state-provider";
import { FinancialPageSkeleton, type FinancialSkeletonRouteKind } from "@/components/ui/loading-state";

function routeKindFromPath(pathname: string): FinancialSkeletonRouteKind {
  if (pathname === "/dashboard" || pathname === "/") return "dashboard";
  if (pathname === "/accounts") return "accounts";
  if (pathname === "/transactions") return "transactions";
  if (pathname === "/transactions/import") return "form";
  if (pathname === "/subscriptions") return "subscriptions";
  if (pathname === "/future-planning") return "planning";
  if (pathname === "/reports") return "dashboard";
  if (pathname === "/settings") return "form";
  if (pathname === "/profile") return "coming-soon";
  if (pathname.includes("/add") || pathname.includes("/edit")) return "form";
  if (pathname === "/forgot-password" || pathname === "/login" || pathname === "/register" || pathname === "/update-password") return "auth";
  if (pathname === "/unavailable" || pathname === "/auth/callback") return "status";
  if (pathname === "/scenario-budgeting" || pathname === "/documents" || pathname === "/people-payments") return "coming-soon";
  return "table";
}

export function RouteLoadingFallback() {
  const isInteractionLoading = useIsInteractionLoading();
  const pathname = usePathname();
  const isSidebarCollapsed = useOptionalSidebarState()?.isSidebarCollapsed ?? false;

  return isInteractionLoading ? null : <FinancialPageSkeleton routeKind={routeKindFromPath(pathname)} sidebarCollapsed={isSidebarCollapsed} />;
}
