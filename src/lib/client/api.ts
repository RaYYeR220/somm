"use client";

async function send<T>(path: string, init: RequestInit): Promise<T> {
  const response = await fetch(path, { ...init, headers: { "content-type": "application/json", ...(init.headers ?? {}) } });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body?.error ?? `Request failed (${response.status})`);
  return body as T;
}

export const postJson = <T>(path: string, body: unknown) => send<T>(path, { method: "POST", body: JSON.stringify(body) });
export const patchJson = <T>(path: string, body: unknown) => send<T>(path, { method: "PATCH", body: JSON.stringify(body) });
export const getJson = <T>(path: string) => send<T>(path, { method: "GET" });

export type SearchHit = { id: string; name: string; type: string; popularity: number | null };

export const searchEntities = (q: string, type?: string) =>
  getJson<{ results: SearchHit[]; status: string }>(`/api/search?q=${encodeURIComponent(q)}${type ? `&type=${type}` : ""}`);
