import Link from "next/link";

import { StatusPage } from "@/components/app/status-page";

export default async function UnavailablePage(props: PageProps<"/unavailable">) {
  const searchParams = await props.searchParams;
  const feature = typeof searchParams.feature === "string" && searchParams.feature.trim() ? searchParams.feature.trim() : "This feature";

  return (
    <StatusPage
      actions={
        <Link
          className="inline-flex min-h-11 items-center justify-center rounded-md bg-[#0b1c30] px-4 text-sm font-semibold text-white transition hover:bg-[#1f2937]"
          href="/dashboard"
        >
          Back to dashboard
        </Link>
      }
      badge="Unavailable"
      description={`${feature} is not available in this version yet. The page is reserved so the navigation can stay consistent while the feature is developed.`}
      fullHeight
      icon="help"
      title={`${feature} unavailable`}
    />
  );
}
