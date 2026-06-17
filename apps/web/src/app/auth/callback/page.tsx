"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase";

export default function AuthCallbackPage() {
  const router = useRouter(); const [message, setMessage] = useState("Completing sign in...");
  useEffect(() => { async function finish() { const supabase = getSupabaseBrowserClient(); const code = new URLSearchParams(window.location.search).get("code"); if (code) await supabase.auth.exchangeCodeForSession(code); const { data, error } = await supabase.auth.getSession(); if (error || !data.session) { setMessage(error?.message ?? "The sign-in link is invalid or expired."); return; } const invitationId = data.session.user.user_metadata.moshomo_invitation_id as string | undefined; router.replace(invitationId ? `/invitations/accept?id=${encodeURIComponent(invitationId)}` : "/app"); } void finish(); }, [router]);
  return <main className="grid min-h-screen place-items-center p-6"><div className="premium-card flex max-w-sm animate-rise items-center gap-3 px-6 py-5 text-sm font-medium text-ink-soft"><span className="size-2 shrink-0 animate-ping rounded-full bg-brand-500" />{message}</div></main>;
}
