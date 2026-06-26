import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { getUserSafely } from "@/lib/supabase/auth";
import { getSupabasePublicEnv } from "@/lib/supabase/env";

const publicRoutes = new Set([
  "/login",
  "/register",
  "/forgot-password",
  "/update-password",
]);

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });
  let env;
  try {
    env = getSupabasePublicEnv();
  } catch {
    const path = request.nextUrl.pathname;
    const isPublicRoute = publicRoutes.has(path) || path.startsWith("/auth/");
    if (isPublicRoute) return response;
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", path);
    url.searchParams.set("error", "auth_unavailable");
    return NextResponse.redirect(url);
  }

  const supabase = createServerClient(
    env.url,
    env.publishableKey,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  const { user, error: authError } = await getUserSafely(supabase);
  const path = request.nextUrl.pathname;
  const isPublicRoute = publicRoutes.has(path) || path.startsWith("/auth/");

  if (!user && !isPublicRoute) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", path);
    if (authError && request.cookies.getAll().some((cookie) => cookie.name.startsWith("sb-"))) {
      url.searchParams.set("error", "auth_unavailable");
    }
    return NextResponse.redirect(url);
  }

  if (user && publicRoutes.has(path) && path !== "/update-password") {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  return response;
}
