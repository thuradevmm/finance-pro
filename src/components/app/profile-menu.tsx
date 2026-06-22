"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { Icon } from "@/components/ui/icon";
import { useInteractionLoading } from "@/components/app/interaction-loading-provider";
import { LoadingSpinner } from "@/components/ui/loading-state";
import { createClient } from "@/lib/supabase/client";
import { getUserSafely } from "@/lib/supabase/auth";

type ProfileMenuProps = {
  compact?: boolean;
};

const menuItems = [
  { label: "Profile", href: "/profile", icon: "account" as const },
  { label: "Settings", href: "/settings", icon: "settings" as const },
];

export function ProfileMenu({ compact = false }: ProfileMenuProps) {
  const router = useRouter();
  const beginLoading = useInteractionLoading();
  const [isOpen, setIsOpen] = useState(false);
  const [fullName, setFullName] = useState("Profile");
  const [email, setEmail] = useState("Account");
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const initials = fullName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("") || "U";

  async function handleLogout() {
    if (isLoggingOut) return;
    setIsLoggingOut(true);
    try {
      await createClient().auth.signOut();
    } catch {
      setIsLoggingOut(false);
      return;
    }
    setIsOpen(false);
    beginLoading();
    router.replace("/login");
    router.refresh();
  }

  useEffect(() => {
    let isMounted = true;
    const supabase = createClient();

    async function loadCurrentUser() {
      const { user } = await getUserSafely(supabase);
      if (!user || !isMounted) return;

      const metadataName = typeof user.user_metadata.full_name === "string" ? user.user_metadata.full_name.trim() : "";
      const { data: profile } = await supabase.from("user_profiles").select("full_name").eq("id", user.id).maybeSingle();
      if (!isMounted) return;

      setFullName(profile?.full_name?.trim() || metadataName || user.email?.split("@")[0] || "User");
      setEmail(user.email ?? "Signed-in account");
    }

    loadCurrentUser();
    return () => { isMounted = false; };
  }, []);

  useEffect(() => {
    function handlePointerDown(event: PointerEvent) {
      if (!menuRef.current?.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, []);

  return (
    <div className="relative" ref={menuRef}>
      <button
        aria-expanded={isOpen}
        aria-haspopup="menu"
        className={
          compact
            ? "grid size-10 place-items-center rounded-md bg-[#eff6ff] text-sm font-bold text-[#0369a1] transition hover:bg-[#dce9ff]"
            : "flex h-10 items-center gap-2 rounded-full border border-[#c6c6cd]/70 bg-white py-1 pl-1 pr-3 text-sm font-semibold text-[#0b1c30] transition hover:bg-[#eff4ff]"
        }
        onClick={() => setIsOpen((current) => !current)}
        type="button"
      >
        <span className="grid size-8 place-items-center rounded-full bg-[#e0f2fe] text-sm font-bold text-[#0369a1]">{initials}</span>
        {compact ? null : (
          <>
            <span>Profile</span>
            <Icon className="size-4 text-[#76777d]" name="chevronDown" />
          </>
        )}
      </button>

      {isOpen ? (
        <div
          className="absolute right-0 top-12 z-30 w-52 overflow-hidden rounded-lg border border-[#c6c6cd]/70 bg-white py-2 shadow-[0_16px_40px_rgba(15,23,42,0.16)]"
          role="menu"
        >
          <div className="border-b border-[#c6c6cd]/40 px-4 py-3">
            <p className="truncate text-sm font-semibold text-[#0b1c30]">{fullName}</p>
            <p className="mt-1 truncate text-xs font-medium text-[#45464d]">{email}</p>
          </div>
          {menuItems.map((item) => (
            <Link
              className="flex h-10 items-center gap-3 px-4 text-sm font-semibold text-[#45464d] transition hover:bg-[#eff4ff] hover:text-[#0b1c30]"
              href={item.href}
              key={item.label}
              onClick={() => setIsOpen(false)}
              role="menuitem"
            >
              <Icon className="size-4" name={item.icon} />
              <span>{item.label}</span>
            </Link>
          ))}
          <div className="mt-1 border-t border-[#c6c6cd]/40 pt-1">
            <button
              className="flex h-10 w-full items-center gap-3 px-4 text-left text-sm font-semibold text-[#991b1b] transition hover:bg-[#fff1f0]"
              disabled={isLoggingOut}
              onClick={handleLogout}
              role="menuitem"
              type="button"
            >
              {isLoggingOut ? <LoadingSpinner /> : <Icon className="size-4" name="logout" />}
              <span>{isLoggingOut ? "Logging Out…" : "Log Out"}</span>
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
