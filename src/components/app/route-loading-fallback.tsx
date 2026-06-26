"use client";

import { usePathname } from "next/navigation";

import { useIsInteractionLoading } from "@/components/app/interaction-loading-provider";
import { useSidebarState } from "@/components/app/sidebar-state-provider";
import { FinancialPageSkeleton, type FinancialSkeletonRouteKind } from "@/components/ui/loading-state";

function routeKindFromPath(pathname: string): FinancialSkeletonRouteKind {
  if (pathname === "/dashboard" || pathname === "/") return "dashboard";
  if (pathname === "/subscriptions") return "subscriptions";
  if (pathname === "/reports") return "report";
  if (pathname === "/settings" || pathname === "/profile") return "settings";
  if (pathname.includes("/add") || pathname.includes("/edit")) return "form";
  if (pathname === "/forgot-password" || pathname === "/login" || pathname === "/register" || pathname === "/update-password") return "detail";
  if (pathname === "/future-planning" || pathname === "/scenario-budgeting" || pathname === "/documents" || pathname === "/people-payments" || pathname === "/unavailable") return "detail";
  return "table";
}

export function RouteLoadingFallback() {
  const isInteractionLoading = useIsInteractionLoading();
  const pathname = usePathname();
  const { isSidebarCollapsed } = useSidebarState();

  return isInteractionLoading ? null : <FinancialPageSkeleton routeKind={routeKindFromPath(pathname)} sidebarCollapsed={isSidebarCollapsed} />;
}
