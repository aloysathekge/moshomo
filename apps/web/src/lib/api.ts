import type { Session } from "@supabase/supabase-js";

const apiUrl = process.env.NEXT_PUBLIC_MOSHOMO_API_URL ?? "http://localhost:8000";

export async function moshomoApi<T>(path: string, options: { method?: "GET" | "POST" | "PATCH" | "PUT" | "DELETE"; session: Session; companyId?: string; body?: unknown }): Promise<T> {
  const headers = new Headers({ Authorization: `Bearer ${options.session.access_token}` });
  if (options.companyId) headers.set("X-Company-ID", options.companyId);
  if (options.body !== undefined) headers.set("Content-Type", "application/json");
  const response = await fetch(`${apiUrl}${path}`, { method: options.method ?? "GET", headers, body: options.body === undefined ? undefined : JSON.stringify(options.body) });
  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { detail?: string } | null;
    throw new Error(payload?.detail ?? `Request failed (${response.status})`);
  }
  if (response.status === 204 || response.headers.get("content-length") === "0") return undefined as T;
  const text = await response.text();
  return (text ? JSON.parse(text) : undefined) as T;
}
