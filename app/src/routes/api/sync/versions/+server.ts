import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { sql } from '$lib/server/db';
import { guard, requireUser } from '$lib/server/respond';
import { listVersions } from '$lib/server/services/sync';

export const GET: RequestHandler = ({ locals }) =>
	guard(async () => {
		requireUser(locals);
		return json(await listVersions(sql));
	});
