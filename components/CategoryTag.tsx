import { categoryShortLabel, categoryTagColors, normalizeCategory } from "@/lib/categories";
import { cn } from "@/lib/cn";

/**
 * A category chip.
 *
 * `fixedWidth` is for the transaction lists, where the chip sits in a row of
 * columns: a chip that sizes to its own text drags the amount beside it left
 * and right from row to row, so the column has to hold still instead.
 */
export function CategoryTag({
  category,
  fixedWidth = false,
  className
}: {
  category: string;
  fixedWidth?: boolean;
  className?: string;
}) {
  const normalized = normalizeCategory(category) ?? category;
  const colors = categoryTagColors(category);

  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md px-2 py-1 text-caption font-medium tracking-[0.04em]",
        fixedWidth ? "w-full justify-center truncate" : "",
        className
      )}
      style={{ backgroundColor: colors.background, color: colors.text }}
      title={normalized}
    >
      {fixedWidth ? categoryShortLabel(normalized) : normalized}
    </span>
  );
}
