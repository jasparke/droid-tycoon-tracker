const SHEET = '1otLCKSCMKICMlnefirQ8KZhh_rdZTd5Mp8h0UYFUiqg';
export const GIDS = ['1248391507', '0', '547464940', '1548395368'] as const;
const url = (gid: string) => `https://docs.google.com/spreadsheets/d/${SHEET}/export?format=csv&gid=${gid}`;

export async function fetchTabs(f: typeof fetch = fetch): Promise<Record<string, string>> {
	const entries = await Promise.all(GIDS.map(async (gid) => {
		const res = await f(url(gid));
		if (!res.ok) throw new Error(`tab ${gid} fetch failed: ${res.status}`);
		return [gid, await res.text()] as const;
	}));
	return Object.fromEntries(entries);
}
