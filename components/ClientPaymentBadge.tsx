"use client";

import { cn } from "@/lib/cn";
import type { ClientPaymentMethod } from "@/types/client";

export function ClientPaymentIcon({ method }: { method: ClientPaymentMethod }) {
  if (method === "Venmo") {
    return (
      <span className="grid h-5 w-5 shrink-0 place-items-center rounded-[6px] bg-[#008CFF]" aria-hidden="true">
        <span className="text-list font-black italic leading-none text-white">V</span>
      </span>
    );
  }

  if (method === "Cash") {
    return (
      <span className="grid h-5 w-5 shrink-0 place-items-center rounded-[6px] bg-[#77736B]" aria-hidden="true">
        <svg className="h-3.5 w-3.5 text-white" viewBox="0 0 20 20" fill="none">
          <path
            d="M10 2.6v14.8M13.8 6.1C13.1 5.1 11.9 4.5 10 4.5c-2.1 0-3.4.9-3.4 2.3 0 1.6 1.6 2.1 3.4 2.5 2 .4 3.7.9 3.7 2.6 0 1.5-1.4 2.6-3.7 2.6-1.9 0-3.3-.6-4.1-1.8"
            stroke="currentColor"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="2"
          />
        </svg>
      </span>
    );
  }

  return (
    <span className="grid h-5 w-5 shrink-0 place-items-center rounded-[6px] bg-[#00A86B]" aria-hidden="true">
      <svg className="h-4 w-4 text-white" viewBox="0 0 24 24" fill="none">
        <circle cx="5.8" cy="9" r="1.8" fill="currentColor" />
        <circle cx="9.2" cy="6.8" r="1.8" fill="currentColor" />
        <circle cx="12.8" cy="7.5" r="1.8" fill="currentColor" />
        <path
          d="M4.6 14.2c.6-2.1 2.4-3.7 4.5-3.7 2.3 0 3.8 1.8 3.8 4 0 1.5-.9 2.4-2.2 2.4-.7 0-1.2-.3-1.7-.7-.5.4-1 .7-1.7.7-1.8 0-3.2-.8-2.7-2.7Z"
          fill="currentColor"
        />
        <path
          d="M14.6 17.2V6.5h3.1c2.2 0 3.5 1.1 3.5 2.8 0 1.5-1.1 2.6-2.8 2.8l3 5.1M14.6 12h3.4"
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="2.2"
        />
      </svg>
    </span>
  );
}

function paymentMethodTone(method: ClientPaymentMethod) {
  if (method === "Rover") return "bg-[#E8F7F0] text-[#247A55]";
  if (method === "Venmo") return "bg-blue-100 text-blue-700";
  return "bg-[#F1F0ED] text-text-secondary";
}

export function ClientPaymentBadge({
  method,
  className,
  showLabel = true
}: {
  method: ClientPaymentMethod;
  className?: string;
  showLabel?: boolean;
}) {
  return (
    <span
      className={cn(
        "inline-flex min-h-7 items-center gap-1.5 rounded-full px-2 py-1 pr-2.5 text-caption font-medium",
        paymentMethodTone(method),
        className
      )}
    >
      <ClientPaymentIcon method={method} />
      {showLabel ? method : null}
    </span>
  );
}
