import type { ReactNode } from "react";

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
  return (
    <div className="min-h-screen bg-[#f8f9ff] text-[#0b1c30]">
      <div className="flex min-h-screen">
        <AppSidebar activeLabel={activeNavLabel} />

        <div className="flex min-w-0 flex-1 flex-col">
          <MobileHeader
            action={mobileAction}
            searchLabel={mobileSearchLabel}
            searchPlaceholder={mobileSearchPlaceholder}
            subtitle={mobileSubtitle}
          />
          <AppTopBar searchLabel={topSearchLabel} searchPlaceholder={topSearchPlaceholder} />

          <main className="mx-auto w-full max-w-[1440px] flex-1 px-4 py-6 md:px-8 md:py-8">{children}</main>
        </div>
      </div>
    </div>
  );
}
