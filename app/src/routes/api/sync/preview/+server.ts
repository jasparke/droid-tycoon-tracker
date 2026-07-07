import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { sql } from '$lib/server/db';
import { guard, requireUser } from '$lib/server/respond';
import { fetchTabs, GIDS } from '$lib/server/sync/fetch';
import { stagePreview } from '$lib/server/services/sync';

export const POST: RequestHandler = ({ locals }) =>
	guard(async () => {
		requireUser(locals);
		const fetchedAt = new Date().toISOString();
		const csvByGid = await fetchTabs();
		const source = `sheet:${GIDS.join(',')}@${fetchedAt}`;
		return json(await stagePreview(sql, csvByGid, source, fetchedAt));
	});
