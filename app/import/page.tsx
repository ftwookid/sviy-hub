import { redirect } from "next/navigation";

/**
 * Import used to be its own tab. It is part of the transactions page now —
 * this only exists so an old bookmark or link still lands somewhere sensible.
 */
export default function ImportRedirectPage() {
  redirect("/");
}
