"use client";

import Link from "next/link";

import { StatusPage } from "@/components/app/status-page";
import { Icon } from "@/components/ui/icon";
import { appFontVariables } from "@/lib/app-fonts";
import "./globals.css";

export default function GlobalError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  return (
    <html className={`${appFontVariables} h-full antialiased`} lang="en">
      <head>
        <title>Application Error | FinancePro</title>
      </head>
      <body className="min-h-full bg-[#f8f9ff]">
        <StatusPage
          actions={
            <>
              <Link
                className="inline-flex min-h-11 items-center justify-center rounded-lg border border-[#c6c6cd]/70 bg-white px-5 text-sm font-semibold text-[#45464d] transition hover:bg-[#eff4ff]"
                href="/"
              >
                Return Home
              </Link>
              <button
                className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-[#0b1c30] px-5 text-sm font-semibold text-white shadow-sm transition hover:bg-[#1f2937]"
                onClick={() => unstable_retry()}
                type="button"
              >
                <Icon className="size-4" name="sync" />
                Reload App
              </button>
            </>
          }
          badge="Critical Error"
          code={error.digest ? `Ref ${error.digest}` : "Global"}
          description="The application shell could not be rendered. This usually points to a higher-level backend or layout failure, so the entire app has been replaced with this fallback page."
          details={error.digest ? `Reference ID: ${error.digest}` : "No error reference was provided for this failure."}
          icon="bell"
          title="FinancePro could not start correctly"
        />
      </body>
    </html>
  );
}
