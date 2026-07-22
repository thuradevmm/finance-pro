import { redirect } from "next/navigation";

import { getSalaryPeriodSettings } from "@/lib/salary-periods/supabase";
import { getUserSafely } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";

export default async function Home() {
  const supabase = await createClient();
  const { user } = await getUserSafely(supabase);
  if (user) {
    let salaryPeriodIsDefault = false;
    try {
      const settings = await getSalaryPeriodSettings(supabase, user.id);
      salaryPeriodIsDefault = settings.enabled && settings.defaultView;
    } catch {
      // Landing on the dashboard is safe if settings cannot be read during a
      // rolling database deployment. The salary page reports operational data
      // errors when the user opens it directly.
    }
    if (salaryPeriodIsDefault) redirect("/salary-periods");
  }
  redirect("/dashboard");
}
