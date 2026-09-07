import type { ReactNode } from "react";

/**
 * The section title, in one place so every section wears the same one.
 *
 * It earns its line on mobile, where the sidebar that would otherwise name the
 * section does not exist: without it, the tab row underneath names the page but
 * nothing names where you are. The action slot keeps a primary button on the
 * same line rather than spending a second row on it.
 *
 * Two things here are what make the title land in the same place on every
 * section, and both were wrong before:
 *
 * - **The row is always 44px**, the height of a button, whether or not this page
 *   has one. Left to `items-center` alone, Clients — which does have one — grew
 *   a taller row and pushed its title several pixels down from where Taxes and
 *   Health printed theirs.
 * - **The gap underneath belongs to the header**, not to each page's own
 *   `space-y`, which ranged from 2 to 5 across the six sections and moved the
 *   first block of content by 12px depending on which one you opened. So the
 *   header sits outside that container, and pages keep their own internal
 *   rhythm without it reaching the title.
 */
export function PageHeader({ title, action }: { title: string; action?: ReactNode }) {
  return (
    <header className="mb-4 flex min-h-11 items-center justify-between gap-3">
      <h1 className="text-display font-medium leading-none tracking-[-0.01em] text-text-primary-lg">
        {title}
      </h1>
      {action}
    </header>
  );
}
