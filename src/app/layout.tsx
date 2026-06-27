import type { Metadata } from "next";
import { cookies } from "next/headers";
import { appFontVariables } from "@/lib/app-fonts";
import { InteractionLoadingProvider } from "@/components/app/interaction-loading-provider";
import { SidebarStateProvider } from "@/components/app/sidebar-state-provider";
import { SessionTimeoutProvider } from "@/components/auth/session-timeout-provider";
import { ToastProvider } from "@/components/ui/toast-provider";
import { sidebarCollapsedCookieName } from "@/lib/sidebar-state";
import "./globals.css";

export const metadata: Metadata = {
  title: "FinancePro",
  description: "Personal financial management dashboard",
  icons: {
    icon: "/icon.svg",
    shortcut: "/icon.svg",
    apple: "/icon.svg",
  },
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const cookieStore = await cookies();
  const initialSidebarCollapsed = cookieStore.get(sidebarCollapsedCookieName)?.value === "true";

  return (
    <html
      lang="en"
      className={`${appFontVariables} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col bg-[#f8f9ff]">
        <SessionTimeoutProvider>
          <SidebarStateProvider initialCollapsed={initialSidebarCollapsed}>
            <InteractionLoadingProvider>
              <ToastProvider>{children}</ToastProvider>
            </InteractionLoadingProvider>
          </SidebarStateProvider>
        </SessionTimeoutProvider>
      </body>
    </html>
  );
}
