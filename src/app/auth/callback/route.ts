import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const requestedPath = url.searchParams.get("next");
  const next = requestedPath?.startsWith("/") ? requestedPath : "/dashboard";

  if (code) {
    const supabase = await createClient();
    try {
      const { error } = await supabase.auth.exchangeCodeForSession(code);
      if (!error) return NextResponse.redirect(new URL(next, url.origin));
    } catch {
      return NextResponse.redirect(new URL("/login?error=auth_unavailable", url.origin));
    }
  }

  return NextResponse.redirect(new URL("/login?error=auth_callback", url.origin));
}
