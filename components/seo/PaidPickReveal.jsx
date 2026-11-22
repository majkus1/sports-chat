'use client';

import { useContext, useEffect, useState } from 'react';
import { UserContext } from '@/context/UserContext';

/**
 * Odsłonięcie zamkniętego typu na stronie ligi — tylko dla zalogowanego z planem (Pro, VIP, próba).
 *
 * PO CO. Strona „typy na dziś [liga]" jest statyczna (10 minut w pamięci podręcznej) i jednakowa dla
 * każdego — dla robota i gościa. Dlatego serwer zawsze rysuje kłódkę: inaczej strona z cache'u
 * zdradzałaby płatne typy wszystkim. 22.11.2026 właściciel z planem VIP widział tu kłódki przy
 * meczach, które na liście meczów miał odkryte.
 *
 * Ten sam wzór co `components/match-preview/PickUnlock.jsx` na stronie meczu, tylko kompaktowy
 * i z jednym zapytaniem na datę dla całej listy.
 *
 * JAK. Po stronie przeglądarki, tylko gdy sesja jest zalogowana: jedno zapytanie na datę do tej samej
 * trasy co lista meczów (`/api/football/model-hints`) — ona sama decyduje według planu, co wychodzi
 * na zewnątrz (`full`). Bez planu albo bez typu dla meczu zostaje kłódka z serwera. Gość i robot nie
 * wywołują niczego.
 */

/** Jedno zapytanie na datę dla całej strony, niezależnie od liczby meczów. */
const ZAPYTANIA = new Map();

function hintsFor(date) {
	if (!ZAPYTANIA.has(date)) {
		ZAPYTANIA.set(
			date,
			fetch(`/api/football/model-hints?date=${encodeURIComponent(date)}`, { credentials: 'include' })
				.then((r) => (r.ok ? r.json() : null))
				.catch(() => null)
		);
	}
	return ZAPYTANIA.get(date);
}

export default function PaidPickReveal({ fixtureId, date, usually, children }) {
	const ctx = useContext(UserContext);
	const zalogowany = Boolean(ctx?.isAuthed);
	const [typ, setTyp] = useState(null);

	useEffect(() => {
		if (!zalogowany) return undefined;
		let anulowane = false;
		hintsFor(date).then((d) => {
			const h = d?.full ? d.hints?.[String(fixtureId)] : null;
			if (!anulowane && h && !h.locked && h.selection) setTyp(h);
		});
		return () => {
			anulowane = true;
		};
	}, [zalogowany, date, fixtureId]);

	if (!typ) return children;
	return (
		<span className="inline-flex flex-wrap items-center gap-1.5 text-xs">
			<span className="rounded-md bg-accent px-2 py-0.5 font-bold text-accent-fg">{typ.selection}</span>
			<span className="font-bold tabular-nums text-text">{typ.probability}%</span>
			{Number.isFinite(typ.base) && (
				<span className="text-muted">
					({usually} {Math.round(typ.base)}%)
				</span>
			)}
		</span>
	);
}
