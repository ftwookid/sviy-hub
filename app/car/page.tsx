import { redirect } from "next/navigation";

/**
 * The car had its own tab. It sits with Mileage now — what the driving is
 * worth and what it costs are the same question — and this keeps an old link
 * landing somewhere sensible.
 */
export default function CarRedirectPage() {
  redirect("/mileage");
}
