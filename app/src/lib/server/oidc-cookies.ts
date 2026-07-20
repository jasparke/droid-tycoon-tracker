import { dev } from '$app/environment';

// __Host- pins a cookie to Secure + Path=/ + no Domain, so the OIDC temp cookies can't
// be planted from a subdomain or shadowed at a narrower path. Browsers reject the prefix
// on plain-http origins, so dev keeps the bare names. `dev` is read per call, not at
// module load: route tests flip it per test, and a module-level capture would freeze it.
const name = (base: string) => (dev ? base : `__Host-${base}`);

export const oidcTempCookieNames = () => ({
	state: name('oidc_state'),
	nonce: name('oidc_nonce'),
	verifier: name('oidc_verifier')
});

export const oidcTempCookieOpts = () =>
	({ path: '/', httpOnly: true, sameSite: 'lax', secure: !dev, maxAge: 600 }) as const;
