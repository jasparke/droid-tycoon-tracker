import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { sql } from '$lib/server/db';
import { guard, requireUser } from '$lib/server/respond';
import { ApiError } from '$lib/server/api-error';
import { rollback } from '$lib/server/services/sync';

export const POST: RequestHandler = ({ locals, request }) =>
	guard(async () => {
		requireUser(locals);
		const body = (await request.json().catch(() => null)) as { versionId?: number } | null;
		if (!body || typeof body.versionId !== 'number') throw new ApiError(422, 'bad_json', 'versionId (number) required');
		return json(await rollback(sql, body.versionId));
	});
