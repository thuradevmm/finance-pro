import type { ReactNode } from "react";

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

// Kept as a server-side content boundary while pages are migrated away from
// their former per-page shell declarations. The real persistent workspace
// chrome is mounted once by the root layout through WorkspaceShell.
export function AppShell({ children }: AppShellProps) {
  return children;
}
