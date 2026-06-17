"use client";

import type { Session } from "@supabase/supabase-js";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";
import { moshomoApi } from "@/lib/api";
import { getSupabaseBrowserClient } from "@/lib/supabase";

const appStoreUrl = process.env.NEXT_PUBLIC_MOSHOMO_IOS_APP_URL;
const playStoreUrl = process.env.NEXT_PUBLIC_MOSHOMO_ANDROID_APP_URL;

export default function AcceptInvitationPage() {
  const router = useRouter();
  const [session, setSession] = useState<Session>();
  const [invitationId, setInvitationId] = useState<string>();
  const [message, setMessage] = useState<string>();
  const [accepting, setAccepting] = useState(false);
  const [accepted, setAccepted] = useState(false);

  useEffect(() => {
    async function load() {
      const { data } = await getSupabaseBrowserClient().auth.getSession();
      if (!data.session) {
        router.replace("/auth");
        return;
      }
      setSession(data.session);
      setInvitationId(
        new URLSearchParams(window.location.search).get("id") ??
          data.session.user.user_metadata.moshomo_invitation_id,
      );
    }
    void load();
  }, [router]);

  async function accept(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!session || !invitationId) return;
    const form = new FormData(event.currentTarget);
    try {
      setAccepting(true);
      setMessage(undefined);
      const { error } = await getSupabaseBrowserClient().auth.updateUser({
        password: String(form.get("password")),
      });
      if (error) throw error;
      const result = await moshomoApi<{ company_id: string }>(
        `/company-invitations/${invitationId}/accept`,
        { method: "POST", session },
      );
      localStorage.setItem("moshomo_company_id", result.company_id);
      setAccepted(true);
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Invitation acceptance failed.",
      );
    } finally {
      setAccepting(false);
    }
  }

  if (accepted) {
    return (
      <main className="grid min-h-screen place-items-center bg-stone-100 p-6">
        <section className="w-full max-w-xl rounded-3xl bg-white p-8 shadow-sm sm:p-10">
          <p className="text-sm font-semibold text-emerald-700">Invitation accepted</p>
          <h1 className="mt-2 text-3xl font-semibold">Welcome to your team</h1>
          <p className="mt-3 leading-7 text-stone-600">
            Your employee profile and company role are connected. Use the same
            email and password to sign in on web or mobile.
          </p>

          <div className="mt-8 rounded-2xl bg-emerald-950 p-6 text-white">
            <p className="text-sm font-semibold text-emerald-300">Moshomo mobile</p>
            <h2 className="mt-2 text-2xl font-semibold">Take your workspace with you</h2>
            <p className="mt-2 text-sm leading-6 text-emerald-100">
              Download the app, then sign in with the account you just created.
              Your company and role will load automatically.
            </p>
            <StoreLinks />
          </div>

          <button
            className="mt-6 w-full rounded-xl bg-emerald-700 px-5 py-3 font-semibold text-white"
            onClick={() => router.replace("/app")}
          >
            Continue on web
          </button>
        </section>
      </main>
    );
  }

  return (
    <main className="grid min-h-screen place-items-center bg-stone-100 p-6">
      <section className="w-full max-w-md rounded-3xl bg-white p-8 shadow-sm">
        <p className="text-sm font-semibold text-emerald-700">You are invited</p>
        <h1 className="mt-2 text-3xl font-semibold">Join your team</h1>
        <p className="mt-3 text-stone-600">
          Choose a password, then Moshomo will connect your account to your
          employee profile and role.
        </p>
        <form className="mt-7 space-y-4" onSubmit={accept}>
          <label className="block text-sm font-medium">
            Password
            <input
              className="mt-2 w-full rounded-xl border border-stone-300 px-4 py-3"
              name="password"
              type="password"
              minLength={8}
              required
            />
          </label>
          {message && <p className="text-sm text-rose-700">{message}</p>}
          <button
            className="w-full rounded-xl bg-emerald-700 px-5 py-3 font-semibold text-white disabled:opacity-50"
            disabled={!session || !invitationId || accepting}
          >
            {accepting ? "Joining your team..." : "Accept invitation"}
          </button>
        </form>
      </section>
    </main>
  );
}

function StoreLinks() {
  if (!appStoreUrl && !playStoreUrl) {
    return (
      <p className="mt-5 rounded-xl bg-white/10 px-4 py-3 text-sm text-emerald-100">
        Mobile app downloads are being prepared. You can continue on web now.
      </p>
    );
  }

  return (
    <div className="mt-5 flex flex-col gap-3 sm:flex-row">
      {appStoreUrl && (
        <a
          className="rounded-xl bg-white px-4 py-3 text-center text-sm font-semibold text-emerald-950"
          href={appStoreUrl}
          rel="noreferrer"
          target="_blank"
        >
          Download for iPhone
        </a>
      )}
      {playStoreUrl && (
        <a
          className="rounded-xl bg-white px-4 py-3 text-center text-sm font-semibold text-emerald-950"
          href={playStoreUrl}
          rel="noreferrer"
          target="_blank"
        >
          Download for Android
        </a>
      )}
    </div>
  );
}
