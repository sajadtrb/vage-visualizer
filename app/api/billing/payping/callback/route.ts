import { NextResponse } from "next/server";

const supabaseUrl = process.env.NEXT_PUBLIC_STUDIO_SUPABASE_URL?.replace(/\/$/, "");
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const paypingToken = process.env.PAYPING_TOKEN;

function result(request: Request, success: boolean, message: string) {
  const url = new URL("/", request.url);
  url.searchParams.set("payment", success ? "success" : "failed");
  url.searchParams.set("message", message);
  return NextResponse.redirect(url);
}

async function adminFetch(path: string, init: RequestInit = {}) {
  if (!supabaseUrl || !serviceRoleKey) throw new Error("Server billing configuration is incomplete.");
  return fetch(`${supabaseUrl}/rest/v1${path}`, { ...init, headers: { apikey: serviceRoleKey, Authorization: `Bearer ${serviceRoleKey}`, "Content-Type": "application/json", ...(init.headers || {}) } });
}

export async function GET(request: Request) {
  if (!supabaseUrl || !serviceRoleKey || !paypingToken) return result(request, false, "پرداخت آنلاین هنوز فعال نشده است.");
  const query = new URL(request.url).searchParams;
  const clientRefId = query.get("clientrefid") || query.get("clientRefId") || query.get("client_ref_id");
  const refId = query.get("refid") || query.get("refId") || query.get("ref_id");
  if (!clientRefId || !refId) return result(request, false, "اطلاعات بازگشت پرداخت ناقص است.");
  try {
    const subscriptionResponse = await adminFetch(`/studio_subscriptions?client_ref_id=eq.${encodeURIComponent(clientRefId)}&select=*`);
    const subscriptions = await subscriptionResponse.json();
    const subscription = subscriptions?.[0];
    if (!subscription) return result(request, false, "درخواست پرداخت پیدا نشد.");
    const verifyResponse = await fetch("https://api.payping.ir/v2/pay/verify", { method: "POST", headers: { Authorization: `Bearer ${paypingToken}`, "Content-Type": "application/json" }, body: JSON.stringify({ refId, amount: Number(subscription.amount_toman) * 10 }) });
    const verifyPayload = await verifyResponse.json().catch(() => null);
    if (!verifyResponse.ok) throw new Error("PayPing verification failed");
    const now = new Date();
    const ends = new Date(now);
    ends.setMonth(ends.getMonth() + 1);
    await adminFetch(`/studio_subscriptions?id=eq.${encodeURIComponent(subscription.id)}`, { method: "PATCH", body: JSON.stringify({ status: "active", started_at: now.toISOString(), ends_at: ends.toISOString(), payping_ref_id: refId }) });
    await adminFetch(`/studio_payment_events?client_ref_id=eq.${encodeURIComponent(clientRefId)}`, { method: "PATCH", body: JSON.stringify({ status: "verified", gateway_ref_id: refId, metadata: { verification: verifyPayload || {} } }) });
    const renders = subscription.plan_code === "starter" ? 2 : subscription.plan_code === "creator" ? 5 : 10;
    await adminFetch(`/studio_profiles?user_id=eq.${encodeURIComponent(subscription.user_id)}`, { method: "PATCH", body: JSON.stringify({ plan_code: subscription.plan_code, access_mode: "limited", render_limit: renders, renders_used_week: 0 }) });
    return result(request, true, "پرداخت با موفقیت تأیید شد.");
  } catch (error) {
    console.error("PayPing callback error", error);
    return result(request, false, "تأیید پرداخت انجام نشد؛ وضعیت تراکنش را بررسی کنید.");
  }
}
