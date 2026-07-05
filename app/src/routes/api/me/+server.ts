import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { guard, requireUser } from '$lib/server/respond';

export const GET: RequestHandler = ({ locals }) => guard(async () => json({ user: requireUser(locals) }));
