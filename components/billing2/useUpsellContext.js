'use client';

import { useEffect, useState } from 'react';
import { useAuthKey } from '@/context/UserContext';

/**
 * Kontekst okien zakupu (`/api/me/upsell`) — jedno żądanie na stronę, ile by zachęt na niej nie było.
 *
 * Pamięć na poziomie modułu, z kluczem sesji: baner w powłoce, zachęta przy „Wyższych kursach"
 * i podpowiedzi przy kuponach pytają o to samo, więc dzielą jedną obietnicę. Zmiana tożsamości
 * (logowanie, wylogowanie) daje nowy klucz i nowe pytanie. Po 5 minutach odpowiedź się starzeje —
 * po zakupie albo zużyciu puli następna strona zapyta od nowa.
 *
 * `null`, dopóki nie wiadomo, kto pyta — zachęty wtedy milczą, żeby płacącemu nie mignęła oferta.
 */
const WAZNOSC_MS = 5 * 60 * 1000;
let pamiec = { key: null, at: 0, promise: null };

function pobierz(key) {
	if (pamiec.key === key && Date.now() - pamiec.at < WAZNOSC_MS && pamiec.promise) return pamiec.promise;
	const promise = fetch('/api/me/upsell', { credentials: 'include' })
		.then((res) => (res.ok ? res.json() : null))
		.catch(() => null);
	pamiec = { key, at: Date.now(), promise };
	return promise;
}

export function useUpsellContext() {
	const authKey = useAuthKey();
	const [data, setData] = useState(null);

	useEffect(() => {
		if (!authKey) return undefined;
		let cancelled = false;
		pobierz(authKey).then((payload) => {
			if (!cancelled) setData(payload || { isLoggedIn: authKey !== 'guest', paid: false, banner: null });
		});
		return () => {
			cancelled = true;
		};
	}, [authKey]);

	return data;
}
