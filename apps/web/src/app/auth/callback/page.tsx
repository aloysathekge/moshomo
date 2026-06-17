"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase";

export default function AuthCallbackPage() {
  const router = useRouter(); const [message, setMessage] = useState("Completing sign in...");
  useEffect(() => { async function finish() { const supabase = getSupabaseBrowserClient(); const code = new URLSearchParams(window.location.search).get("code"); if (code) await supabase.auth.exchangeCodeForSession(code); const { data, error } = await supabase.auth.getSession(); if (error || !data.session) { setMessage(error?.message ?? "The sign-in link is invalid or expired."); return; } const invitationId = data.session.user.user_metadata.moshomo_invitation_id as string | undefined; router.replace(invitationId ? `/invitations/accept?id=${encodeURIComponent(invitationId)}` : "/app"); } void finish(); }, [router]);
  return <main className="grid min-h-screen place-items-center bg-stone-100"><p className="rounded-2xl bg-white p-6 shadow-sm">{message}</p></main>;
}
