import { Check } from "lucide-react";

export function Toast({ message }: { message: string }) {
  return (
    <div className="fixed inset-x-4 bottom-[calc(88px+env(safe-area-inset-bottom))] z-[55] flex items-center gap-2 rounded-lg border border-border bg-surface px-4 py-3 text-list text-text-primary shadow-card transition duration-200 ease-in-out md:inset-x-auto md:bottom-5 md:right-5">
      <Check size={16} strokeWidth={1.5} className="text-success" />
      {message}
    </div>
  );
}
