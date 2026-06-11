import { categoryTagColors } from "@/lib/categories";

export function CategoryTag({ category }: { category: string }) {
  const colors = categoryTagColors(category);

  return (
    <span
      className="inline-flex items-center rounded-md px-2 py-1 text-[11px] font-medium tracking-[0.04em]"
      style={{ backgroundColor: colors.background, color: colors.text }}
    >
      {category}
    </span>
  );
}
