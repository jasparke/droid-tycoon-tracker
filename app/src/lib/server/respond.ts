import { json } from '@sveltejs/kit';
import { ApiError } from './api-error';

export async function guard(fn: () => Promise<Response>): Promise<Response> {
	try {
		return await fn();
	} catch (e) {
		if (e instanceof ApiError) return json({ error: e.message, code: e.code }, { status: e.status });
		throw e;
	}
}

export function requireUser(locals: App.Locals): { id: number; username: string } {
	if (!locals.user) throw new ApiError(401, 'unauthenticated', 'Log in first');
	return locals.user;
}
