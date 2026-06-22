import type { SupabaseClient, User } from "@supabase/supabase-js";

export type SafeUserResult = {
  error: string | null;
  user: User | null;
};

export async function getUserSafely(supabase: SupabaseClient): Promise<SafeUserResult> {
  try {
    const { data: { user }, error } = await supabase.auth.getUser();
    return {
      error: error ? "Unable to verify your session." : null,
      user: error ? null : user,
    };
  } catch {
    return {
      error: "Unable to reach Supabase. Check the network connection and try again.",
      user: null,
    };
  }
}
