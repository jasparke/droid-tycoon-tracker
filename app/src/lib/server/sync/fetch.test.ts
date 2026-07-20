import { describe, it, expect } from 'vitest';
import { fetchTabs, GIDS } from './fetch';

const csvFor = (gid: string) => `header\nrow-${gid}`;

// a well-behaved stub: 200 + small CSV body per tab
const okFetch: typeof fetch = async (input) => {
	const gid = new URL(String(input)).searchParams.get('gid')!;
	return new Response(csvFor(gid), { status: 200 });
};

describe('fetchTabs', () => {
	// pins the pre-existing contract
	it('returns the CSV text of every tab keyed by gid', async () => {
		const tabs = await fetchTabs(okFetch);
		expect(Object.keys(tabs).sort()).toEqual([...GIDS].sort());
		for (const gid of GIDS) expect(tabs[gid]).toBe(csvFor(gid));
	});

	it('throws on a non-ok response', async () => {
		const f: typeof fetch = async () => new Response('nope', { status: 500 });
		await expect(fetchTabs(f)).rejects.toThrow(/500/);
	});

	it('aborts a hung request after timeoutMs', async () => {
		const hang: typeof fetch = (_input, init) =>
			new Promise((_resolve, reject) => {
				init?.signal?.addEventListener('abort', () => reject(init.signal!.reason));
			});
		await expect(fetchTabs(hang, { timeoutMs: 25 })).rejects.toMatchObject({ name: 'TimeoutError' });
	});

	it('rejects a response body larger than maxBytes instead of buffering it', async () => {
		const huge: typeof fetch = async () => new Response('x'.repeat(1000), { status: 200 });
		await expect(fetchTabs(huge, { maxBytes: 100 })).rejects.toThrow(/exceed/i);
	});

	it('still resolves when every tab is under maxBytes', async () => {
		const tabs = await fetchTabs(okFetch, { maxBytes: 1024 });
		expect(Object.keys(tabs)).toHaveLength(GIDS.length);
	});
});
