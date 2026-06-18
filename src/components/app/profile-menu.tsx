"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { Icon } from "@/components/ui/icon";

type ProfileMenuProps = {
  compact?: boolean;
};

const menuItems = [
  { label: "Profile", href: "/profile", icon: "account" as const },
  { label: "Settings", href: "/settings", icon: "settings" as const },
];

export function ProfileMenu({ compact = false }: ProfileMenuProps) {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  function handleLogout() {
    window.localStorage.removeItem("finance-pro.mock-session");
    window.sessionStorage.removeItem("finance-pro.mock-session");
    setIsOpen(false);
    router.push("/login");
  }

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
        <span className="grid size-8 place-items-center rounded-full bg-[#e0f2fe] text-sm font-bold text-[#0369a1]">AF</span>
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
            <p className="text-sm font-semibold text-[#0b1c30]">Aung Finance</p>
            <p className="mt-1 text-xs font-medium text-[#45464d]">Owner account</p>
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
              onClick={handleLogout}
              role="menuitem"
              type="button"
            >
              <Icon className="size-4" name="logout" />
              <span>Log Out</span>
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
