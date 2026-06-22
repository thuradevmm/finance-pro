import type { Metadata } from "next";
import { appFontVariables } from "@/lib/app-fonts";
import { InteractionLoadingProvider } from "@/components/app/interaction-loading-provider";
import { SessionTimeoutProvider } from "@/components/auth/session-timeout-provider";
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

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${appFontVariables} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col bg-[#f8f9ff]"><SessionTimeoutProvider><InteractionLoadingProvider>{children}</InteractionLoadingProvider></SessionTimeoutProvider></body>
    </html>
  );
}
