import { APP_TIMEZONE } from '@/lib/time';

/**
 * Formatowanie rejestru typów — czyste funkcje dla komponentów (strona i strona główna).
 * Bez Reacta, żeby dało się je sprawdzić testem; teksty przychodzą z `messages/*.json` (`trust`).
 */

const lokal = (locale) => (locale === 'en' ? 'en-GB' : 'pl-PL');

/** Kurs dziesiętny z dwoma miejscami: „1,45" / „1.45". */
export function formatOdds(value, locale) {
	if (!Number.isFinite(value)) return null;
	return value.toLocaleString(lokal(locale), { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/**
 * Procent ze znakiem z ułamka: 0.0263 → „+2,6%". Zero bez znaku — „0,0%" to „bez zmiany",
 * a „+0,0%" sugerowałoby zysk, którego nie ma.
 */
export function formatSignedPct(fraction, locale, digits = 1) {
	if (!Number.isFinite(fraction)) return null;
	const v = Number((fraction * 100).toFixed(digits));
	const tekst = Math.abs(v).toLocaleString(lokal(locale), { minimumFractionDigits: digits, maximumFractionDigits: digits });
	if (v === 0) return `${tekst}%`;
	return `${v > 0 ? '+' : '−'}${tekst}%`;
}

/** Udział bez znaku: 0.3988 → „40%". */
export function formatShare(fraction, locale, digits = 0) {
	if (!Number.isFinite(fraction)) return null;
	return `${(fraction * 100).toLocaleString(lokal(locale), { minimumFractionDigits: digits, maximumFractionDigits: digits })}%`;
}

/** Data i godzina czasu polskiego: „19.11, 08:24" (en: „19/11, 08:24"). */
export function formatDateTime(value, locale) {
	const d = value ? new Date(value) : null;
	if (!d || !Number.isFinite(d.getTime())) return null;
	const data = d.toLocaleDateString(lokal(locale), { day: '2-digit', month: '2-digit', timeZone: APP_TIMEZONE });
	const godz = d.toLocaleTimeString(lokal(locale), { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: APP_TIMEZONE });
	return `${data}, ${godz}`;
}

/** Wyprzedzenie publikacji wobec meczu rozbite na dni, godziny i minuty. */
export function leadParts(minutes) {
	if (!Number.isFinite(minutes) || minutes < 0) return null;
	const m = Math.floor(minutes);
	return { d: Math.floor(m / 1440), h: Math.floor((m % 1440) / 60), m: m % 60, total: m };
}

/** Klucz tłumaczenia wyprzedzenia (`trust.lead_*`) i wartości. */
export function leadMessage(minutes) {
	const p = leadParts(minutes);
	if (!p) return null;
	if (p.d > 0) return { key: 'lead_days', values: { d: p.d, h: p.h } };
	if (p.h > 0) return { key: 'lead_hours', values: { h: p.h, m: p.m } };
	return { key: 'lead_minutes', values: { m: p.m } };
}

/**
 * Selekcja typu jako klucz tłumaczenia (`trust.sel_*`) — z postaci znormalizowanej, nie z tekstu
 * zapisanego przez model językowy, żeby ta sama selekcja brzmiała w rejestrze zawsze tak samo.
 *
 * @returns {{ key: string, values: object } | null}
 */
export function selectionMessage(normalized, { homeName, awayName, home = 'Gospodarze', away = 'Goście', locale = 'pl' } = {}) {
	if (!normalized) return null;
	const druzyna = (side) => (side === 'home' ? homeName || home : awayName || away);
	const linia = (v) => (Number.isFinite(v) ? v.toLocaleString(lokal(locale)) : '');
	switch (normalized.type) {
		case 'matchWinner':
			if (normalized.value === 'draw') return { key: 'sel_draw', values: {} };
			if (normalized.value === 'home' || normalized.value === 'away')
				return { key: `sel_${normalized.value}`, values: { team: druzyna(normalized.value) } };
			return null;
		case 'doubleChance':
			if (normalized.value === '1X') return { key: 'sel_1X', values: { team: druzyna('home') } };
			if (normalized.value === 'X2') return { key: 'sel_X2', values: { team: druzyna('away') } };
			if (normalized.value === '12') return { key: 'sel_12', values: {} };
			return null;
		case 'teamGoals': {
			const team = druzyna(normalized.side);
			if (normalized.dir === 'over' && normalized.line === 0.5) return { key: 'sel_team_scores', values: { team } };
			return { key: normalized.dir === 'over' ? 'sel_team_over' : 'sel_team_under', values: { team, line: linia(normalized.line) } };
		}
		case 'totalGoals':
			return { key: normalized.dir === 'over' ? 'sel_total_over' : 'sel_total_under', values: { line: linia(normalized.line) } };
		case 'btts':
			return { key: normalized.value === 'yes' ? 'sel_btts_yes' : 'sel_btts_no', values: {} };
		default:
			return null;
	}
}

/** Ton koloru CLV: dodatnie zielone, ujemne czerwone, zero i brak — wyciszone. */
export function clvTone(clv) {
	if (!Number.isFinite(clv) || clv === 0) return 'text-muted';
	return clv > 0 ? 'text-win' : 'text-loss';
}
