import type { Handle } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { sessionCookieName } from '$lib/server/oidc-cookies';
import { validateSession } from '$lib/server/services/users';

export const handle: Handle = async ({ event, resolve }) => {
	const token = event.cookies.get(sessionCookieName());
	event.locals.user = token ? await validateSession(db, token) : null;
	return resolve(event);
};
