"use client";

import { useState } from "react";

import { Icon, type IconName } from "@/components/ui/icon";

type AuthFieldProps = {
  autoComplete: string;
  error?: string;
  icon: IconName;
  label: string;
  name: string;
  onChange: (value: string) => void;
  placeholder: string;
  type?: "email" | "password" | "text";
  value: string;
};

export function AuthField({ autoComplete, error, icon, label, name, onChange, placeholder, type = "text", value }: AuthFieldProps) {
  const [showPassword, setShowPassword] = useState(false);
  const isPassword = type === "password";
  const inputType = isPassword && showPassword ? "text" : type;

  return (
    <div>
      <label className="mb-2 block break-words text-xs font-bold uppercase text-[#45464d]" htmlFor={name}>{label}</label>
      <div className="relative">
        <Icon className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-[#76777d]" name={icon} />
        <input
          aria-describedby={error ? `${name}-error` : undefined}
          aria-invalid={Boolean(error)}
          autoComplete={autoComplete}
          className={`h-12 min-w-0 w-full rounded-lg border bg-white pl-12 text-sm font-medium text-[#0b1c30] outline-none transition placeholder:text-[#8b8d94] focus:border-[#2170e4] focus:ring-2 focus:ring-[#2170e4]/20 ${isPassword ? "pr-14" : "pr-4"} ${error ? "border-[#ba1a1a]" : "border-[#c6c6cd]"}`}
          id={name}
          name={name}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          type={inputType}
          value={value}
        />
        {isPassword ? (
          <button
            aria-label={showPassword ? "Hide password" : "Show password"}
            className="absolute right-1 top-1/2 grid size-11 -translate-y-1/2 place-items-center rounded-md text-[#5f6168] transition hover:bg-[#eff4ff] hover:text-[#2170e4] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2170e4]/25"
            onClick={() => setShowPassword((current) => !current)}
            title={showPassword ? "Hide password" : "Show password"}
            type="button"
          >
            <Icon className="size-5" name={showPassword ? "eyeOff" : "eye"} />
          </button>
        ) : null}
      </div>
      {error ? <p className="mt-1.5 break-words text-xs font-medium text-[#ba1a1a] [overflow-wrap:anywhere]" id={`${name}-error`}>{error}</p> : null}
    </div>
  );
}
