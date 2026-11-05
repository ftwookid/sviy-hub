import { bridgeEnv } from "@/lib/telegram-bridge/paths";
import { vercelFetch } from "@/lib/telegram-bridge/vercel";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// The webhook returns immediately and finishes the Grok forward via waitUntil.
// 60s covers that forward plus a Telegram send on the same instance.
export const maxDuration = 60;

function handle(request: Request): Promise<Response> {
  return vercelFetch(request, bridgeEnv());
}

export function GET(request: Request) {
  return handle(request);
}

export function POST(request: Request) {
  return handle(request);
}

export function HEAD(request: Request) {
  return handle(request);
}

export function PUT(request: Request) {
  return handle(request);
}

export function PATCH(request: Request) {
  return handle(request);
}

export function DELETE(request: Request) {
  return handle(request);
}

export function OPTIONS(request: Request) {
  return handle(request);
}
