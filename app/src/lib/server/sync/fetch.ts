const SHEET = '1otLCKSCMKICMlnefirQ8KZhh_rdZTd5Mp8h0UYFUiqg';
export const GIDS = ['1248391507', '0', '547464940', '1548395368'] as const;
const url = (gid: string) => `https://docs.google.com/spreadsheets/d/${SHEET}/export?format=csv&gid=${gid}`;

// The sheet URL is hardcoded (no SSRF surface); the timeout and size cap only keep a
// hung or runaway Sheets response from stalling preview / ballooning memory.
const TIMEOUT_MS = 15_000;
const MAX_BYTES = 5 * 1024 * 1024; // per tab; real tabs are tens of KB

async function readCapped(res: Response, maxBytes: number, gid: string): Promise<string> {
	if (!res.body) {
		const text = await res.text();
		if (text.length > maxBytes) throw new Error(`tab ${gid}: response exceeded ${maxBytes} bytes`);
		return text;
	}
	const reader = res.body.getReader();
	const decoder = new TextDecoder();
	let out = '';
	let bytes = 0;
	for (;;) {
		const { done, value } = await reader.read();
		if (done) break;
		bytes += value.byteLength;
		if (bytes > maxBytes) {
			await reader.cancel();
			throw new Error(`tab ${gid}: response exceeded ${maxBytes} bytes`);
		}
		out += decoder.decode(value, { stream: true });
	}
	return out + decoder.decode();
}

export async function fetchTabs(
	f: typeof fetch = fetch,
	opts: { timeoutMs?: number; maxBytes?: number } = {}
): Promise<Record<string, string>> {
	const { timeoutMs = TIMEOUT_MS, maxBytes = MAX_BYTES } = opts;
	const entries = await Promise.all(GIDS.map(async (gid) => {
		// the signal also aborts a stalled body read, not just the connect
		const res = await f(url(gid), { signal: AbortSignal.timeout(timeoutMs) });
		if (!res.ok) throw new Error(`tab ${gid} fetch failed: ${res.status}`);
		return [gid, await readCapped(res, maxBytes, gid)] as const;
	}));
	return Object.fromEntries(entries);
}
