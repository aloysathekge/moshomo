import type { Session } from '@supabase/supabase-js';

const apiUrl = process.env.EXPO_PUBLIC_MOSHOMO_API_URL ?? 'http://localhost:8000';

export async function moshomoApi<T>(path: string, options: { session: Session; method?: 'GET' | 'POST'; companyId?: string; body?: unknown }): Promise<T> {
  const response = await fetch(`${apiUrl}${path}`, {
    method: options.method ?? 'GET',
    headers: {
      Authorization: `Bearer ${options.session.access_token}`,
      ...(options.companyId ? { 'X-Company-ID': options.companyId } : {}),
      ...(options.body === undefined ? {} : { 'Content-Type': 'application/json' }),
    },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { detail?: string } | null;
    throw new Error(payload?.detail ?? `Request failed (${response.status})`);
  }
  return (await response.json()) as T;
}
