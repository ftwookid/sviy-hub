import type { ReactNode } from "react";

/**
 * The section title, in one place so every section wears the same one.
 *
 * It earns its line on mobile, where the sidebar that would otherwise name the
 * section does not exist: without it, the tab row underneath names the page but
 * nothing names where you are. The action slot keeps a primary button on the
 * same line rather than spending a second row on it.
 */
export function PageHeader({ title, action }: { title: string; action?: ReactNode }) {
  return (
    <header className="flex items-center justify-between gap-3">
      <h1 className="text-[30px] font-medium leading-none tracking-[-0.01em] text-text-primary sm:text-[34px]">
        {title}
      </h1>
      {action}
    </header>
  );
}
