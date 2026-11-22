/** Atrapa `next/headers` (`nextHeadersHook.mjs`): ciasteczka z `globalThis.__testCookies` (nazwa → wartość). */
export async function cookies() {
	const jar = globalThis.__testCookies || {};
	return {
		get: (name) => (jar[name] === undefined ? undefined : { name, value: jar[name] }),
		set: (name, value) => {
			jar[name] = value;
		},
		delete: (name) => {
			delete jar[name];
		},
	};
}

export async function headers() {
	return new Headers();
}
