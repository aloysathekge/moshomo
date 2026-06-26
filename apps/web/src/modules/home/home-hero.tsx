"use client";

import { KeyboardEvent, useState } from "react";
import { Icon } from "@/components/icon";
import type { Role } from "@/lib/apps";

const PROMPTS: Record<Role, string[]> = {
  admin: [
    "Who's on leave today?",
    "Show pending leave approvals",
    "Any open shifts this week?",
    "How many employees do we have?",
  ],
  manager: [
    "Who's on my team?",
    "Show pending leave approvals",
    "Any open shifts this week?",
    "Who's on leave today?",
  ],
  employee: [
    "How many leave days do I have?",
    "When is my next shift?",
    "Who is my manager?",
    "What is our leave policy?",
  ],
};

export function HomeHero({
  firstName,
  onAsk,
  role,
  setupBanner,
}: {
  firstName?: string;
  onAsk: (question: string) => void;
  role: Role;
  setupBanner?: React.ReactNode;
}) {
  const [input, setInput] = useState("");

  function submit() {
    const trimmed = input.trim();
    if (!trimmed) return;
    onAsk(trimmed);
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      submit();
    }
  }

  return (
    <div className="mx-auto flex min-h-[calc(100vh-12rem)] max-w-2xl flex-col items-center justify-center animate-rise">
      <p className="eyebrow flex items-center gap-1.5">
        <Icon name="sparkles" className="size-3.5" /> Moshomo AI
      </p>
      <h1 className="mt-4 text-center text-3xl font-semibold tracking-tight sm:text-4xl">
        {firstName ? `Hi ${firstName}, what can I do for you?` : "What can I do for you?"}
      </h1>
      <p className="mt-3 text-center text-ink-muted">Ask about your team, leave, or shifts — grounded in your data.</p>

      <div className="mt-8 w-full">
        <div className="premium-card flex flex-col gap-3">
          <textarea
            aria-label="Ask Moshomo"
            className="min-h-[3rem] w-full resize-none bg-transparent text-[15px] leading-6 text-ink outline-none placeholder:text-ink-faint"
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Ask about your workforce…"
            rows={2}
            value={input}
          />
          <div className="flex items-center justify-between">
            <span className="text-xs text-ink-faint">Enter to send · Shift+Enter for a new line</span>
            <button
              aria-label="Send"
              className="grid size-9 place-items-center rounded-xl bg-ink text-white transition hover:opacity-90 disabled:opacity-40"
              disabled={!input.trim()}
              onClick={submit}
              type="button"
            >
              <svg aria-hidden className="size-4" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 24 24">
                <path d="M12 19V5M5 12l7-7 7 7" />
              </svg>
            </button>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap justify-center gap-2">
          {PROMPTS[role].map((prompt) => (
            <button className="chip" key={prompt} onClick={() => onAsk(prompt)} type="button">
              {prompt}
            </button>
          ))}
        </div>
      </div>

      {setupBanner && <div className="mt-8 w-full">{setupBanner}</div>}
    </div>
  );
}
