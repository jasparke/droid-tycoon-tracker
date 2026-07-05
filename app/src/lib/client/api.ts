export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
	const r = await fetch(path, {
		...init,
		headers: { 'content-type': 'application/json', ...(init?.headers as Record<string, string> | undefined) }
	});
	const body = await r.json().catch(() => ({}));
	if (!r.ok) throw new Error(body.error ?? `HTTP ${r.status}`);
	return body as T;
}
