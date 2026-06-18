"use client";

import type { Session } from "@supabase/supabase-js";
import { FormEvent, useRef, useState } from "react";
import { moshomoApi } from "@/lib/api";
import type { Role } from "@/lib/apps";

type Citation = { table: string; id: string; title?: string };
type AssistantResponse = {
  run_id: string | null;
  status: string;
  answer: string | null;
  refusal_reason: string | null;
  citations: Citation[];
  provider: string;
  model: string;
};
type Turn = {
  role: "user" | "assistant";
  text: string;
  citations?: Citation[];
  tone?: "answer" | "refusal" | "error";
};

const suggestions: Record<Role, string[]> = {
  admin: ["Who is on the team?", "Find an employee by name", "What is our leave policy?"],
  manager: ["Who is on my team?", "Show a teammate's profile", "What is our leave policy?"],
  employee: ["What is my leave policy?", "Who is my manager?", "Find a colleague"],
};

export function AssistantPanel({
  companyId,
  role,
  session,
}: {
  companyId: string;
  role: Role;
  session: Session;
}) {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);

  async function ask(question: string) {
    const trimmed = question.trim();
    if (!trimmed || sending) return;
    setTurns((current) => [...current, { role: "user", text: trimmed }]);
    setInput("");
    setSending(true);
    try {
      const result = await moshomoApi<AssistantResponse>("/workforce/assistant", {
        method: "POST",
        session,
        companyId,
        body: { question: trimmed },
      });
      const refused = result.status === "refused";
      const text = refused
        ? result.refusal_reason ?? "I can't help with that."
        : result.answer ?? "I couldn't find an answer to that.";
      setTurns((current) => [
        ...current,
        { role: "assistant", text, citations: result.citations, tone: refused ? "refusal" : "answer" },
      ]);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Something went wrong.";
      setTurns((current) => [...current, { role: "assistant", text: message, tone: "error" }]);
    } finally {
      setSending(false);
      requestAnimationFrame(() =>
        listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" }),
      );
    }
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    void ask(input);
  }

  const empty = turns.length === 0;

  return (
    <div className="mx-auto flex h-[calc(100vh-9rem)] max-w-3xl animate-rise flex-col">
      <div className="mb-5">
        <p className="eyebrow">Moshomo AI</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">Ask Moshomo</h1>
        <p className="mt-2 text-ink-muted">
          Ask about your workforce. Answers are grounded in the data you are allowed to see.
        </p>
      </div>

      <div
        className="premium-card flex-1 overflow-y-auto p-5"
        ref={listRef}
      >
        {empty ? (
          <div className="grid h-full place-items-center text-center">
            <div>
              <span className="grid mx-auto size-12 place-items-center rounded-2xl bg-brand-100 text-brand-700">
                <svg aria-hidden className="size-6" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" viewBox="0 0 24 24">
                  <path d="m12 3-1.5 4.5L6 9l4.5 1.5L12 15l1.5-4.5L18 9l-4.5-1.5L12 3Z" />
                  <path d="m5 15-.7 2.3L2 18l2.3.7L5 21l.7-2.3L8 18l-2.3-.7L5 15Z" />
                </svg>
              </span>
              <p className="mt-4 text-sm font-semibold">What would you like to know?</p>
              <div className="mt-5 flex flex-wrap justify-center gap-2">
                {suggestions[role].map((item) => (
                  <button className="chip" key={item} onClick={() => void ask(item)} type="button">
                    {item}
                  </button>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {turns.map((turn, index) => (
              <Bubble key={index} turn={turn} />
            ))}
            {sending && (
              <div className="flex items-center gap-2 text-sm text-ink-muted">
                <span className="size-2 animate-ping rounded-full bg-brand-500" />
                Moshomo is thinking…
              </div>
            )}
          </div>
        )}
      </div>

      <form className="mt-4 flex gap-3" onSubmit={submit}>
        <input
          className="input"
          disabled={sending}
          onChange={(event) => setInput(event.target.value)}
          placeholder="Ask about employees, leave, or shifts…"
          value={input}
        />
        <button className="primary-button" disabled={sending || !input.trim()}>
          Ask
        </button>
      </form>
    </div>
  );
}

function Bubble({ turn }: { turn: Turn }) {
  if (turn.role === "user") {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] rounded-2xl rounded-br-md bg-brand-900 px-4 py-2.5 text-sm text-white">
          {turn.text}
        </div>
      </div>
    );
  }
  const toneClass =
    turn.tone === "error"
      ? "border-rose-200 bg-rose-50 text-rose-800"
      : turn.tone === "refusal"
        ? "border-amber-200 bg-amber-50 text-amber-900"
        : "border-[var(--line)] bg-surface-muted text-ink";
  return (
    <div className="flex justify-start">
      <div className={`max-w-[85%] rounded-2xl rounded-bl-md border px-4 py-3 text-sm leading-6 ${toneClass}`}>
        <p className="whitespace-pre-wrap">{turn.text}</p>
        {turn.citations && turn.citations.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5 border-t border-black/5 pt-3">
            {turn.citations.map((citation) => (
              <span className="badge" key={`${citation.table}-${citation.id}`}>
                {citation.title ?? citation.table}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
