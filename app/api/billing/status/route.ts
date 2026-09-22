import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export function GET() {
  return NextResponse.json({ available: Boolean(
    process.env.PAYPING_TOKEN && process.env.SUPABASE_SERVICE_ROLE_KEY &&
    process.env.NEXT_PUBLIC_STUDIO_SUPABASE_URL && process.env.NEXT_PUBLIC_STUDIO_SUPABASE_ANON_KEY
  ) }, { headers: { "Cache-Control": "no-store" } });
}
