import type { ReactNode } from "react";

type PageHeaderProps = {
  title: string;
  description: string;
  actions?: ReactNode;
};

export function PageHeader({ title, description, actions }: PageHeaderProps) {
  return (
    <div className="mb-6 flex min-w-0 flex-col justify-between gap-4 md:flex-row md:items-end">
      <div className="min-w-0">
        <h1 className="break-words text-2xl font-semibold leading-tight text-[#0b1c30] sm:text-3xl">{title}</h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-[#45464d]">{description}</p>
      </div>
      {actions ? <div className="flex w-full min-w-0 flex-col items-stretch gap-3 sm:w-auto sm:flex-row sm:flex-wrap sm:items-center sm:justify-end [&_a]:min-h-11 [&_button]:min-h-11">{actions}</div> : null}
    </div>
  );
}
