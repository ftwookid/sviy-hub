import { Check } from "lucide-react";

export function Toast({ message }: { message: string }) {
  return (
    <div className="fixed bottom-5 right-5 z-50 flex items-center gap-2 rounded-lg border border-border bg-surface px-4 py-3 text-[13px] text-text-primary shadow-card transition duration-200 ease-in-out">
      <Check size={16} strokeWidth={1.5} className="text-success" />
      {message}
    </div>
  );
}
