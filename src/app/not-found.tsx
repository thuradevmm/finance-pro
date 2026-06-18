import Link from "next/link";

import { StatusPage } from "@/components/app/status-page";
import { Icon } from "@/components/ui/icon";

export default function NotFound() {
  return (
    <StatusPage
      actions={
        <>
          <Link
            className="inline-flex h-11 items-center justify-center rounded-lg border border-[#c6c6cd]/70 bg-white px-5 text-sm font-semibold text-[#45464d] transition hover:bg-[#eff4ff]"
            href="/"
          >
            Return Home
          </Link>
          <Link
            className="inline-flex h-11 items-center gap-2 rounded-lg bg-[#0b1c30] px-5 text-sm font-semibold text-white shadow-sm transition hover:bg-[#1f2937]"
            href="/transactions"
          >
            <Icon className="size-4" name="receipt" />
            Open Transactions
          </Link>
        </>
      }
      badge="Not Found"
      code="404"
      description="The page or record you requested does not exist, or the link is no longer valid in the current workspace state."
      icon="search"
      title="We could not find that resource"
    />
  );
}
