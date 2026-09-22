import { NextResponse } from "next/server";

const supabaseUrl = process.env.NEXT_PUBLIC_STUDIO_SUPABASE_URL?.replace(/\/$/, "");
const supabaseKey = process.env.NEXT_PUBLIC_STUDIO_SUPABASE_ANON_KEY;
const paypingToken = process.env.PAYPING_TOKEN;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const plans = {
  starter: { title: "Vage Studio Starter", amountToman: 500_000 },
  creator: { title: "Vage Studio Creator", amountToman: 1_500_000 },
  pro: { title: "Vage Studio Pro", amountToman: 3_000_000 },
} as const;

function json(message: string, status = 400) {
  return NextResponse.json({ message }, { status });
}

export async function POST(request: Request) {
  if (!supabaseUrl || !supabaseKey) return json("Studio billing is not configured.", 503);
  if (!paypingToken || !serviceRoleKey) return json("درگاه پرداخت هنوز برای محیط آنلاین تنظیم نشده است.", 503);
  const authorization = request.headers.get("authorization");
  if (!authorization?.startsWith("Bearer ")) return json("برای خرید باید وارد حساب شوید.", 401);

  const userResponse = await fetch(`${supabaseUrl}/auth/v1/user`, { headers: { apikey: supabaseKey, Authorization: authorization } });
  const user = await userResponse.json().catch(() => null);
  if (!userResponse.ok || !user?.id) return json("نشست حساب منقضی شده است؛ دوباره وارد شوید.", 401);
  const body = await request.json().catch(() => ({}));
  const plan = plans[body.planCode as keyof typeof plans];
  if (!plan) return json("پلن انتخاب‌شده معتبر نیست.");

  const clientRefId = `vage_studio_${crypto.randomUUID()}`;
  const returnUrl = process.env.PAYPING_CALLBACK_URL || new URL("/api/billing/payping/callback", request.url).toString();
  const subscription = await fetch(`${supabaseUrl}/rest/v1/studio_subscriptions`, {
    method: "POST",
    headers: { apikey: serviceRoleKey, Authorization: `Bearer ${serviceRoleKey}`, "Content-Type": "application/json", Prefer: "return=representation" },
    body: JSON.stringify({ user_id: user.id, plan_code: body.planCode, amount_toman: plan.amountToman, client_ref_id: clientRefId, status: "pending" }),
  });
  const subscriptionRows = await subscription.json().catch(() => []);
  if (!subscription.ok) return json("ثبت درخواست پرداخت انجام نشد.", 502);
  const subscriptionId = subscriptionRows?.[0]?.id;
  await fetch(`${supabaseUrl}/rest/v1/studio_payment_events`, {
    method: "POST",
    headers: { apikey: serviceRoleKey, Authorization: `Bearer ${serviceRoleKey}`, "Content-Type": "application/json", Prefer: "return=minimal" },
    body: JSON.stringify({ user_id: user.id, subscription_id: subscriptionId, gateway: "payping", status: "created", amount_toman: plan.amountToman, client_ref_id: clientRefId, metadata: { plan_code: body.planCode } }),
  });

  const paypingResponse = await fetch("https://api.payping.ir/v2/pay", {
    method: "POST",
    headers: { Authorization: `Bearer ${paypingToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ clientRefId, payerIdentity: user.email || user.id, Amount: plan.amountToman * 10, Description: plan.title, returnUrl }),
  });
  const paypingPayload = await paypingResponse.json().catch(() => null);
  if (!paypingResponse.ok || !paypingPayload?.code) return json("درگاه پرداخت پاسخ معتبر نداد. درخواست پرداخت لغو شد.", 502);
  const saved = await fetch(`${supabaseUrl}/rest/v1/studio_subscriptions?client_ref_id=eq.${encodeURIComponent(clientRefId)}`, { method: "PATCH", headers: { apikey: serviceRoleKey, Authorization: `Bearer ${serviceRoleKey}`, "Content-Type": "application/json" }, body: JSON.stringify({ payping_code: String(paypingPayload.code) }) });
  if (!saved.ok) return json("ثبت اطلاعات پرداخت انجام نشد. دوباره تلاش کنید.", 502);
  return NextResponse.json({ checkoutUrl: `https://api.payping.ir/v2/pay/gotoipg/${encodeURIComponent(String(paypingPayload.code))}`, clientRefId });
}
