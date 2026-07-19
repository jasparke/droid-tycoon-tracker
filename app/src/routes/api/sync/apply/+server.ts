import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { sql } from '$lib/server/db';
import { guard, requireUser } from '$lib/server/respond';
import { ApiError } from '$lib/server/api-error';
import { applyPayload } from '$lib/server/services/sync';

export const POST: RequestHandler = ({ locals, request }) =>
	guard(async () => {
		requireUser(locals);
		const body = (await request.json().catch(() => null)) as {
			baseVersionId?: number;
			payloadChecksum?: string;
			acknowledgedHolds?: string[];
		} | null;
		if (!body || typeof body.baseVersionId !== 'number' || typeof body.payloadChecksum !== 'string') {
			throw new ApiError(422, 'bad_json', 'baseVersionId (number) and payloadChecksum (string) required');
		}
		return json(
			await applyPayload(sql, {
				baseVersionId: body.baseVersionId,
				payloadChecksum: body.payloadChecksum,
				acknowledgedHolds: body.acknowledgedHolds ?? []
			})
		);
	});
