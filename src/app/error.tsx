"use client";

import Link from "next/link";

import { StatusPage } from "@/components/app/status-page";
import { Icon } from "@/components/ui/icon";

export default function Error({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  return (
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
            Try Again
          </button>
        </>
      }
      badge="Application Error"
      code={error.digest ? `Ref ${error.digest}` : "Unhandled"}
      description="The request did not complete successfully. This can happen after a backend failure, a data loading issue, or an unexpected runtime error."
      details={error.digest ? `Reference ID: ${error.digest}` : "No error reference was provided for this failure."}
      icon="help"
      title="Something went wrong while loading this screen"
    />
  );
}
