import { createBrowserClient } from "@supabase/ssr";
import { getSupabasePublicEnv } from "@/lib/supabase/env";

export function createClient() {
  const { publishableKey, url } = getSupabasePublicEnv();

  return createBrowserClient(
    url,
    publishableKey,
  );
}
