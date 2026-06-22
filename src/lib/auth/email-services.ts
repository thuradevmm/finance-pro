// Email-sending auth flows are opt-in while the Supabase free-tier limit is constrained.
// Set NEXT_PUBLIC_EMAIL_SERVICES_ENABLED=true and rebuild to restore them.
export const emailServicesEnabled = process.env.NEXT_PUBLIC_EMAIL_SERVICES_ENABLED === "true";
