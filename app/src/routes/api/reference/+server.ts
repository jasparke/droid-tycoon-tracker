import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { guard, requireUser } from '$lib/server/respond';
import { getReference } from '$lib/server/services/reference';

export const GET: RequestHandler = ({ locals, setHeaders }) =>
	guard(async () => {
		requireUser(locals);
		setHeaders({ 'cache-control': 'private, max-age=300' });
		return json(await getReference(db));
	});
