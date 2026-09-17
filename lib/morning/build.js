/**
 * Treść porannego maila — czysta funkcja z gotowych danych na tekst i HTML.
 *
 * MAIL MA DAĆ POWÓD, ŻEBY WRÓCIĆ — W DWADZIEŚCIA SEKUND CZYTANIA. Kolejność sekcji jest
 * kolejnością ciekawości: najpierw „czy wczoraj poszło" (po to ludzie otwierają), potem
 * „co model widzi dziś", potem ulubione mecze i kolejka, jeśli jest o czym mówić.
 *
 * WSZYSTKO Z RACHUNKU, NIC Z AI. Typy to te same plakietki co na liście meczów, rozliczenia
 * to te same rekordy co w panelu skuteczności. Zero kosztu poza wysyłką — i zero szansy,
 * że mail powie coś innego niż aplikacja.
 *
 * ZERO KURSÓW, ZERO SŁÓW O ZAKŁADACH. To skrzynka pocztowa: każde takie słowo to reklama
 * hazardu w rozumieniu ustawy, nie kwestia stylu. Test pilnuje listy zakazanych słów.
 *
 * PUSTY DZIEŃ = BRAK MAILA. Gdy model nie ma nic, nic się nie rozliczyło, ulubione nie grają
 * i kolejka nie czeka — funkcja zwraca `null` i wysyłka nie idzie. Codzienny mail bez treści
 * to najkrótsza droga do „wypisz mnie".
 */

const TEKSTY = {
	pl: {
		hello: (name) => `Dzień dobry${name ? `, ${name}` : ''}`,
		subjectToday: (n) => (n === 1 ? 'Model widzi 1 typ na dziś' : `Model widzi ${n} typy na dziś`),
		subjectYesterday: (won, all) => `wczoraj ${won}/${all} trafione`,
		subjectFallback: 'Twój poranny przegląd meczów',
		yesterday: 'Wczoraj',
		modelLine: (won, all) => `Model: ${won}/${all} trafione`,
		mineLine: (won, all) => `Twoje typy: ${won}/${all} trafione`,
		hit: 'trafiony',
		miss: 'chybiony',
		today: 'Dziś model widzi',
		usually: 'zwykle',
		open: 'Zobacz mecz',
		favorites: 'Twoje ulubione mecze dziś',
		favoriteNoPick: 'model: bez mocnego typu',
		round: (closes, picked, total) =>
			`Kolejka zamyka się dziś o ${closes} — masz ${picked} z ${total} typów. Model już wytypował.`,
		assistant: 'Chcesz wiedzieć, co słychać przed którymś z tych meczów? Zapytaj asystenta.',
		assistantLink: 'Otwórz asystenta',
		disclaimer: 'To szacunki, nie pewniki. Pełną analizę z czynnikami i ryzykami zobaczysz po kliknięciu meczu.',
		disclaimerShort: 'To szacunki, nie pewniki.',
		why: 'Dostajesz ten mail, bo masz plan Pro lub VIP i włączyłeś poranny przegląd w panelu konta.',
		unsubscribe: 'Wyłącz poranny mail',
		listSeparator: ' · ',
	},
	en: {
		hello: (name) => `Good morning${name ? `, ${name}` : ''}`,
		subjectToday: (n) => (n === 1 ? 'The model sees 1 pick today' : `The model sees ${n} picks today`),
		subjectYesterday: (won, all) => `yesterday ${won}/${all} hit`,
		subjectFallback: 'Your morning match briefing',
		yesterday: 'Yesterday',
		modelLine: (won, all) => `Model: ${won}/${all} hit`,
		mineLine: (won, all) => `Your picks: ${won}/${all} hit`,
		hit: 'hit',
		miss: 'miss',
		today: 'Today the model sees',
		usually: 'usually',
		open: 'Open match',
		favorites: 'Your favourite matches today',
		favoriteNoPick: 'model: no strong pick',
		round: (closes, picked, total) =>
			`The round closes today at ${closes} — you have ${picked} of ${total} picks in. The model has already picked.`,
		assistant: 'Want to know what’s in the news before one of these games? Ask the assistant.',
		assistantLink: 'Open the assistant',
		disclaimer: 'These are estimates, not certainties. Click a match for the full analysis with factors and risks.',
		disclaimerShort: 'These are estimates, not certainties.',
		why: 'You receive this because you are on Pro or VIP and switched on the morning briefing in your account panel.',
		unsubscribe: 'Turn off the morning email',
		listSeparator: ' · ',
	},
};

/** Data w nagłówku: „sobota, 19 września" — z Intl, nie z ręcznej tabeli. */
function ladnaData(dateStr, locale) {
	return new Intl.DateTimeFormat(locale === 'en' ? 'en-GB' : 'pl-PL', {
		timeZone: 'Europe/Warsaw',
		weekday: 'long',
		day: 'numeric',
		month: 'long',
	}).format(new Date(`${dateStr}T12:00:00Z`));
}

function esc(s) {
	return String(s ?? '')
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;');
}

/**
 * @param {object} input
 * @param {string|null} input.name imię/nazwa użytkownika
 * @param {'pl'|'en'} input.locale
 * @param {string} input.date YYYY-MM-DD (dzień wysyłki, czas polski)
 * @param {{ model: Array<{home,away,selection,status}>, mine: Array<{home,away,selection,status}> }} input.yesterday
 * @param {Array<{fixtureId,home,away,selection,probability,base,kickoffLocal}>} input.today posortowane po przewadze
 * @param {Array<{fixtureId,home,away,kickoffLocal,selection?,probability?,base?}>} input.favorites
 * @param {{ closesLocal: string, picked: number, total: number } | null} input.round
 * @param {string} input.siteUrl bez ukośnika na końcu
 * @param {string} input.unsubscribeUrl
 * @returns {{ subject: string, text: string, html: string } | null}
 */
export function buildMorningEmail({ name, locale, date, yesterday, today, favorites, round, siteUrl, unsubscribeUrl }) {
	const t = TEKSTY[locale] || TEKSTY.pl;
	const lang = locale === 'en' ? 'en' : 'pl';
	const model = yesterday?.model || [];
	const mine = yesterday?.mine || [];
	const typy = (today || []).slice(0, 5);
	const ulubione = favorites || [];

	const maWczoraj = model.length > 0 || mine.length > 0;
	const maDzis = typy.length > 0;
	const maUlubione = ulubione.length > 0;
	const maKolejke = Boolean(round && round.picked < round.total);
	if (!maWczoraj && !maDzis && !maUlubione && !maKolejke) return null;

	/*
	 * „Co słychać przed którymś z tych meczów?" i „zobaczysz po kliknięciu meczu" mają sens
	 * tylko wtedy, gdy w mailu są mecze PRZED NAMI. Mail z samym rozliczeniem wczoraj
	 * dostawał oba zdania i pytał o wiadomości sprzed meczów, które już się odbyły.
	 */
	const maMeczePrzedNami = maDzis || maUlubione;

	const wonModel = model.filter((p) => p.status === 'won').length;
	const wonMine = mine.filter((p) => p.status === 'won').length;

	// Temat: liczby, które mówią coś już w skrzynce.
	const czesci = [];
	if (maDzis) czesci.push(t.subjectToday(typy.length));
	if (model.length) czesci.push(t.subjectYesterday(wonModel, model.length));
	const subject = czesci.length ? czesci.join(' · ') : t.subjectFallback;

	const mecz = (href, home, away) => ({ href: `${siteUrl}/${lang}/mecz/${href}`, label: `${home} – ${away}` });
	const statusSlowo = (s) => (s === 'won' ? t.hit : t.miss);

	/* ---------- tekst ---------- */
	const T = [];
	T.push(`${t.hello(name)} — ${ladnaData(date, lang)}`, '');
	if (maWczoraj) {
		T.push(`${t.yesterday}:`);
		if (model.length) {
			T.push(`  ${t.modelLine(wonModel, model.length)}`);
			for (const p of model) T.push(`    ${p.status === 'won' ? '✓' : '✗'} ${p.home} – ${p.away}: ${p.selection}`);
		}
		if (mine.length) {
			T.push(`  ${t.mineLine(wonMine, mine.length)}`);
			for (const p of mine) T.push(`    ${p.status === 'won' ? '✓' : '✗'} ${p.home} – ${p.away}: ${p.selection}`);
		}
		T.push('');
	}
	if (maDzis) {
		T.push(`${t.today}:`);
		for (const p of typy) {
			const m = mecz(p.fixtureId, p.home, p.away);
			T.push(`  • ${m.label}${t.listSeparator}${p.selection}${t.listSeparator}${p.probability}% (${t.usually} ${Math.round(p.base)}%)${t.listSeparator}${p.kickoffLocal}`);
			T.push(`    ${m.href}`);
		}
		T.push('');
	}
	if (maUlubione) {
		T.push(`${t.favorites}:`);
		for (const f of ulubione) {
			const m = mecz(f.fixtureId, f.home, f.away);
			const opis = f.selection ? `${f.selection}${t.listSeparator}${f.probability}% (${t.usually} ${Math.round(f.base)}%)` : t.favoriteNoPick;
			T.push(`  • ${m.label}${t.listSeparator}${f.kickoffLocal}${t.listSeparator}${opis}`);
			T.push(`    ${m.href}`);
		}
		T.push('');
	}
	if (maKolejke) T.push(t.round(round.closesLocal, round.picked, round.total), '');
	if (maMeczePrzedNami) T.push(`${t.assistant} ${siteUrl}/${lang}/pilka-nozna/asystent`, '');
	T.push(maMeczePrzedNami ? t.disclaimer : t.disclaimerShort, '', t.why, `${t.unsubscribe}: ${unsubscribeUrl}`);
	const text = T.join('\n');

	/* ---------- HTML ---------- */
	const wiersz = (m, opis, meta) =>
		`<tr><td style="padding:10px 0;border-bottom:1px solid #eee;">` +
		`<a href="${esc(m.href)}" style="color:#173b45;font-weight:700;text-decoration:none;font-size:16px;">${esc(m.label)}</a>` +
		`<div style="color:#333;font-size:14px;margin-top:3px;">${esc(opis)}</div>` +
		(meta ? `<div style="color:#888;font-size:13px;margin-top:2px;">${esc(meta)}</div>` : '') +
		`</td></tr>`;

	const H = [];
	H.push(`<h2 style="margin:0 0 6px 0;color:#333;font-size:22px;font-weight:400;">${esc(t.hello(name))}</h2>`);
	H.push(`<p style="margin:0 0 22px 0;color:#888;font-size:14px;">${esc(ladnaData(date, lang))}</p>`);

	if (maWczoraj) {
		H.push(`<h3 style="margin:0 0 8px 0;color:#173b45;font-size:13px;letter-spacing:.06em;text-transform:uppercase;">${esc(t.yesterday)}</h3>`);
		if (model.length) {
			H.push(`<p style="margin:0 0 4px 0;color:#333;font-size:15px;font-weight:700;">${esc(t.modelLine(wonModel, model.length))}</p>`);
			H.push(`<ul style="margin:0 0 12px 0;padding-left:18px;color:#555;font-size:14px;line-height:1.7;">`);
			for (const p of model) H.push(`<li><span style="color:${p.status === 'won' ? '#1c8f5a' : '#c0392b'};font-weight:700;">${p.status === 'won' ? '✓' : '✗'}</span> ${esc(p.home)} – ${esc(p.away)}: ${esc(p.selection)} <span style="color:#888;">(${esc(statusSlowo(p.status))})</span></li>`);
			H.push(`</ul>`);
		}
		if (mine.length) {
			H.push(`<p style="margin:0 0 4px 0;color:#333;font-size:15px;font-weight:700;">${esc(t.mineLine(wonMine, mine.length))}</p>`);
			H.push(`<ul style="margin:0 0 12px 0;padding-left:18px;color:#555;font-size:14px;line-height:1.7;">`);
			for (const p of mine) H.push(`<li><span style="color:${p.status === 'won' ? '#1c8f5a' : '#c0392b'};font-weight:700;">${p.status === 'won' ? '✓' : '✗'}</span> ${esc(p.home)} – ${esc(p.away)}: ${esc(p.selection)}</li>`);
			H.push(`</ul>`);
		}
		H.push(`<div style="height:14px;"></div>`);
	}

	if (maDzis) {
		H.push(`<h3 style="margin:0 0 4px 0;color:#173b45;font-size:13px;letter-spacing:.06em;text-transform:uppercase;">${esc(t.today)}</h3>`);
		H.push(`<table role="presentation" style="width:100%;border-collapse:collapse;">`);
		for (const p of typy) {
			H.push(wiersz(mecz(p.fixtureId, p.home, p.away), `${p.selection}${t.listSeparator}${p.probability}% (${t.usually} ${Math.round(p.base)}%)`, p.kickoffLocal));
		}
		H.push(`</table><div style="height:18px;"></div>`);
	}

	if (maUlubione) {
		H.push(`<h3 style="margin:0 0 4px 0;color:#173b45;font-size:13px;letter-spacing:.06em;text-transform:uppercase;">${esc(t.favorites)}</h3>`);
		H.push(`<table role="presentation" style="width:100%;border-collapse:collapse;">`);
		for (const f of ulubione) {
			const opis = f.selection ? `${f.selection}${t.listSeparator}${f.probability}% (${t.usually} ${Math.round(f.base)}%)` : t.favoriteNoPick;
			H.push(wiersz(mecz(f.fixtureId, f.home, f.away), opis, f.kickoffLocal));
		}
		H.push(`</table><div style="height:18px;"></div>`);
	}

	if (maKolejke) {
		H.push(`<p style="margin:0 0 18px 0;padding:12px 14px;background:#f1f6f5;border-left:4px solid #173b45;color:#333;font-size:14px;line-height:1.6;">${esc(t.round(round.closesLocal, round.picked, round.total))} <a href="${esc(siteUrl)}/${lang}/pilka-nozna/kolejka" style="color:#173b45;">→</a></p>`);
	}

	if (maMeczePrzedNami) {
		H.push(`<p style="margin:0 0 6px 0;color:#555;font-size:14px;line-height:1.6;">${esc(t.assistant)} <a href="${esc(siteUrl)}/${lang}/pilka-nozna/asystent" style="color:#173b45;font-weight:700;">${esc(t.assistantLink)}</a></p>`);
	}
	H.push(`<p style="margin:18px 0 0 0;color:#888;font-size:13px;line-height:1.6;">${esc(maMeczePrzedNami ? t.disclaimer : t.disclaimerShort)}</p>`);
	H.push(`<p style="margin:14px 0 0 0;color:#aaa;font-size:12px;line-height:1.6;">${esc(t.why)} <a href="${esc(unsubscribeUrl)}" style="color:#888;">${esc(t.unsubscribe)}</a></p>`);

	const html =
		`<!DOCTYPE html><html lang="${lang}"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>` +
		`<body style="margin:0;padding:0;font-family:'Roboto Condensed',Arial,sans-serif;background-color:#f1f1f1;">` +
		`<table role="presentation" style="width:100%;border-collapse:collapse;background-color:#f1f1f1;padding:20px;"><tr><td align="center" style="padding:20px 0;">` +
		`<table role="presentation" style="max-width:600px;width:100%;background-color:#ffffff;border-radius:8px;box-shadow:0 2px 8px rgba(0,0,0,0.1);border-collapse:collapse;">` +
		`<tr><td style="padding:28px 30px;text-align:center;background-color:#173b45;border-radius:8px 8px 0 0;"><h1 style="margin:0;color:#ffffff;font-size:22px;font-weight:400;">Czat Sportowy</h1></td></tr>` +
		`<tr><td style="padding:30px;">${H.join('')}</td></tr>` +
		`</table></td></tr></table></body></html>`;

	return { subject, text, html };
}
