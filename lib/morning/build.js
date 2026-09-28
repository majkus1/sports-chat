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
 * CODZIENNIE COŚ KONKRETNEGO. Pierwsza wersja milczała w dni bez typów i rozliczeń — a to
 * były akurat wtorki i środy z Ligą Mistrzów, kiedy zainteresowanie jest największe. Teraz
 * mail ma zawsze z czego być: typy na dziś, a gdy jest ich mało — typy na jutro; „warte
 * uwagi" mecze dnia z szansami modelu (wyraźnie podpisane: bez typu); skuteczność modelu
 * z ostatnich 30 dni. `null` zostaje tylko wtedy, gdy nie ma dosłownie niczego.
 */

/** „1 typ", „3 typy", „5 typów" — polska odmiana liczebnika. */
function typow(n) {
	if (n === 1) return '1 typ';
	const d = n % 10;
	const s = n % 100;
	return d >= 2 && d <= 4 && (s < 12 || s > 14) ? `${n} typy` : `${n} typów`;
}

/** „1 mecz", „3 mecze", „5 meczów". */
function meczow(n) {
	if (n === 1) return '1 mecz';
	const d = n % 10;
	const s = n % 100;
	return d >= 2 && d <= 4 && (s < 12 || s > 14) ? `${n} mecze` : `${n} meczów`;
}

const TEKSTY = {
	pl: {
		hello: (name) => `Dzień dobry${name ? `, ${name}` : ''}`,
		subjectToday: (n) => `Model widzi ${typow(n)} na dziś`,
		subjectTomorrow: (n) => `Jutro model widzi ${typow(n)}`,
		subjectFeatured: (n) => `Dziś ${meczow(n)} wartych uwagi`,
		subjectAccuracy: (pct) => `Skuteczność modelu: ${pct}% w 30 dni`,
		tomorrow: 'Jutro model widzi',
		featured: 'Warte uwagi dziś — bez typu',
		featuredLine: (h, d, a) => `model: gospodarze ${h}% · remis ${d}% · goście ${a}%`,
		featuredNote: 'Przy tych meczach model nie widzi przewagi wystarczającej na typ — pokazujemy same szanse.',
		accuracy: 'Skuteczność modelu — ostatnie 30 dni',
		accuracyLine: (won, all, pct, base) => `${won} z ${all} typów trafionych (${pct}%) — samo „zwykle" dałoby ${base}%.`,
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
		whyTrial: (n) =>
			n <= 1
				? 'Dostajesz ten mail w okresie próbnym — to ostatni dzień. Od jutra poranny mail i typy z liczbami są w planie Pro.'
				: `Dostajesz ten mail w okresie próbnym — zostało ${n} dni. Potem poranny mail i typy z liczbami są w planie Pro.`,
		seePlans: 'Zobacz plany',
		unsubscribe: 'Wyłącz poranny mail',
		listSeparator: ' · ',
	},
	en: {
		hello: (name) => `Good morning${name ? `, ${name}` : ''}`,
		subjectToday: (n) => (n === 1 ? 'The model sees 1 pick today' : `The model sees ${n} picks today`),
		subjectTomorrow: (n) => (n === 1 ? 'Tomorrow the model sees 1 pick' : `Tomorrow the model sees ${n} picks`),
		subjectFeatured: (n) => (n === 1 ? '1 match worth a look today' : `${n} matches worth a look today`),
		subjectAccuracy: (pct) => `Model accuracy: ${pct}% over 30 days`,
		tomorrow: 'Tomorrow the model sees',
		featured: 'Worth a look today — no pick',
		featuredLine: (h, d, a) => `model: home ${h}% · draw ${d}% · away ${a}%`,
		featuredNote: 'The model sees no edge big enough for a pick in these — we show the chances only.',
		accuracy: 'Model accuracy — last 30 days',
		accuracyLine: (won, all, pct, base) => `${won} of ${all} picks hit (${pct}%) — “usually” alone would have given ${base}%.`,
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
		whyTrial: (n) =>
			n <= 1
				? 'You get this email during your trial — today is the last day. From tomorrow the morning email and picks with numbers are on Pro.'
				: `You get this email during your trial — ${n} days left. After that the morning email and picks with numbers are on Pro.`,
		seePlans: 'See plans',
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
 * @param {Array<{fixtureId,home,away,selection,probability,base,kickoffLocal}>} [input.tomorrow] typy na jutro
 *   — pokazywane, gdy na dziś jest ich mniej niż trzy
 * @param {Array<{fixtureId,home,away,league,kickoffLocal,probabilities:{home,draw,away}}>} [input.featured]
 *   ważne mecze dnia BEZ typu, z szansami modelu 1X2
 * @param {{ won: number, total: number, base: number } | null} [input.accuracy] typy modelu z 30 dni
 * @param {string} input.siteUrl bez ukośnika na końcu
 * @param {string} input.unsubscribeUrl
 * @returns {{ subject: string, text: string, html: string } | null}
 */
export function buildMorningEmail({
	name,
	locale,
	date,
	yesterday,
	today,
	favorites,
	round,
	tomorrow = [],
	featured = [],
	accuracy = null,
	trialDaysLeft = 0,
	siteUrl,
	unsubscribeUrl,
}) {
	const t = TEKSTY[locale] || TEKSTY.pl;
	const lang = locale === 'en' ? 'en' : 'pl';
	const model = yesterday?.model || [];
	const mine = yesterday?.mine || [];
	const typy = (today || []).slice(0, 5);
	const ulubione = favorites || [];
	// Jutro tylko wtedy, gdy dziś jest mało — mail ma odpowiadać na „co dziś", nie zastępować listy.
	const jutro = typy.length < 3 ? (tomorrow || []).slice(0, 5 - typy.length) : [];
	const warte = (featured || []).slice(0, 4);
	const skutecznosc = accuracy && accuracy.total >= 10 ? accuracy : null;

	const maWczoraj = model.length > 0 || mine.length > 0;
	const maDzis = typy.length > 0;
	const maJutro = jutro.length > 0;
	const maWarte = warte.length > 0;
	const maUlubione = ulubione.length > 0;
	const maKolejke = Boolean(round && round.picked < round.total);
	const maSkutecznosc = Boolean(skutecznosc);
	if (!maWczoraj && !maDzis && !maJutro && !maWarte && !maUlubione && !maKolejke && !maSkutecznosc) return null;

	/*
	 * „Co słychać przed którymś z tych meczów?" i „zobaczysz po kliknięciu meczu" mają sens
	 * tylko wtedy, gdy w mailu są mecze PRZED NAMI. Mail z samym rozliczeniem wczoraj
	 * dostawał oba zdania i pytał o wiadomości sprzed meczów, które już się odbyły.
	 */
	const maMeczePrzedNami = maDzis || maJutro || maWarte || maUlubione;

	const wonModel = model.filter((p) => p.status === 'won').length;
	const wonMine = mine.filter((p) => p.status === 'won').length;
	const pct = (a, b) => Math.round((100 * a) / Math.max(1, b));

	// Temat: liczby, które mówią coś już w skrzynce — pierwsza z nich, która jest.
	const czesci = [];
	if (maDzis) czesci.push(t.subjectToday(typy.length));
	else if (maJutro) czesci.push(t.subjectTomorrow(jutro.length));
	else if (maWarte) czesci.push(t.subjectFeatured(warte.length));
	if (model.length) czesci.push(t.subjectYesterday(wonModel, model.length));
	if (!czesci.length && maSkutecznosc) czesci.push(t.subjectAccuracy(pct(skutecznosc.won, skutecznosc.total)));
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
	if (maJutro) {
		T.push(`${t.tomorrow}:`);
		for (const p of jutro) {
			const m = mecz(p.fixtureId, p.home, p.away);
			T.push(`  • ${m.label}${t.listSeparator}${p.selection}${t.listSeparator}${p.probability}% (${t.usually} ${Math.round(p.base)}%)${t.listSeparator}${p.kickoffLocal}`);
			T.push(`    ${m.href}`);
		}
		T.push('');
	}
	if (maWarte) {
		T.push(`${t.featured}:`);
		for (const w of warte) {
			const m = mecz(w.fixtureId, w.home, w.away);
			const p = w.probabilities;
			T.push(`  • ${m.label}${t.listSeparator}${w.kickoffLocal}${w.league ? `${t.listSeparator}${w.league}` : ''}`);
			T.push(`    ${t.featuredLine(p.home, p.draw, p.away)}`);
			T.push(`    ${m.href}`);
		}
		T.push(`  ${t.featuredNote}`, '');
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
	if (maSkutecznosc) {
		T.push(`${t.accuracy}:`, `  ${t.accuracyLine(skutecznosc.won, skutecznosc.total, pct(skutecznosc.won, skutecznosc.total), Math.round(skutecznosc.base))}`, '');
	}
	if (maMeczePrzedNami) T.push(`${t.assistant} ${siteUrl}/${lang}/pilka-nozna/asystent`, '');
	const dlaczego = trialDaysLeft > 0 ? t.whyTrial(trialDaysLeft) : t.why;
	T.push(maMeczePrzedNami ? t.disclaimer : t.disclaimerShort, '', dlaczego);
	if (trialDaysLeft > 0) T.push(`${t.seePlans}: ${siteUrl}/${lang}/cennik`);
	T.push(`${t.unsubscribe}: ${unsubscribeUrl}`);
	const text = T.join('\n');

	/* ---------- HTML ---------- */
	/*
	 * KAŻDA SEKCJA TO OSOBNY BLOK: pasek z tytułem na jasnym tle i wyraźny odstęp od następnej.
	 * Wcześniej tytuły były małymi napisami wciśniętymi między wiersze meczów i „dziś" zlewało się
	 * z „jutro". Wyłącznie tabele i style w linii — tak samo czytają to Gmail, Outlook i telefony.
	 */
	const ODSTEP = `<div style="height:30px;line-height:30px;font-size:0;">&nbsp;</div>`;
	const tytul = (tekst) =>
		`<table role="presentation" style="width:100%;border-collapse:collapse;"><tr>` +
		`<td style="padding:9px 12px;background-color:#eef4f3;border-left:4px solid #173b45;color:#173b45;font-size:13px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;">${esc(tekst)}</td>` +
		`</tr></table>`;
	const wiersz = (m, opis, meta, ostatni) =>
		`<tr><td style="padding:12px 2px;${ostatni ? '' : 'border-bottom:1px solid #eceff1;'}">` +
		`<a href="${esc(m.href)}" style="color:#173b45;font-weight:700;text-decoration:none;font-size:16px;">${esc(m.label)}</a>` +
		`<div style="color:#333;font-size:14px;margin-top:4px;">${esc(opis)}</div>` +
		(meta ? `<div style="color:#888;font-size:13px;margin-top:3px;">${esc(meta)}</div>` : '') +
		`</td></tr>`;
	/** Lista meczów pod tytułem; ostatni wiersz bez kreski — sekcję zamyka odstęp. */
	const tabela = (lista, doWiersza) =>
		`<table role="presentation" style="width:100%;border-collapse:collapse;">` +
		lista.map((x, i) => doWiersza(x, i === lista.length - 1)).join('') +
		`</table>`;
	const typWiersz = (p, ostatni) =>
		wiersz(mecz(p.fixtureId, p.home, p.away), `${p.selection}${t.listSeparator}${p.probability}% (${t.usually} ${Math.round(p.base)}%)`, p.kickoffLocal, ostatni);
	const rozliczenie = (lista, zeSlowem) =>
		`<ul style="margin:0;padding-left:18px;color:#555;font-size:14px;line-height:1.8;">` +
		lista
			.map(
				(p) =>
					`<li><span style="color:${p.status === 'won' ? '#1c8f5a' : '#c0392b'};font-weight:700;">${p.status === 'won' ? '✓' : '✗'}</span> ${esc(p.home)} – ${esc(p.away)}: ${esc(p.selection)}` +
					(zeSlowem ? ` <span style="color:#888;">(${esc(statusSlowo(p.status))})</span>` : '') +
					`</li>`
			)
			.join('') +
		`</ul>`;

	const H = [];
	H.push(`<h2 style="margin:0 0 6px 0;color:#333;font-size:22px;font-weight:400;">${esc(t.hello(name))}</h2>`);
	H.push(`<p style="margin:0 0 26px 0;color:#888;font-size:14px;">${esc(ladnaData(date, lang))}</p>`);

	const sekcje = [];
	if (maWczoraj) {
		const s = [tytul(t.yesterday)];
		if (model.length) {
			s.push(`<p style="margin:12px 0 4px 0;color:#333;font-size:15px;font-weight:700;">${esc(t.modelLine(wonModel, model.length))}</p>`);
			s.push(rozliczenie(model, true));
		}
		if (mine.length) {
			s.push(`<p style="margin:14px 0 4px 0;color:#333;font-size:15px;font-weight:700;">${esc(t.mineLine(wonMine, mine.length))}</p>`);
			s.push(rozliczenie(mine, false));
		}
		sekcje.push(s.join(''));
	}
	if (maDzis) sekcje.push(tytul(t.today) + tabela(typy, typWiersz));
	if (maJutro) sekcje.push(tytul(t.tomorrow) + tabela(jutro, typWiersz));
	if (maWarte) {
		sekcje.push(
			tytul(t.featured) +
				tabela(warte, (w, ostatni) =>
					wiersz(
						mecz(w.fixtureId, w.home, w.away),
						t.featuredLine(w.probabilities.home, w.probabilities.draw, w.probabilities.away),
						[w.kickoffLocal, w.league].filter(Boolean).join(t.listSeparator),
						ostatni
					)
				) +
				`<p style="margin:8px 0 0 0;color:#888;font-size:13px;line-height:1.5;">${esc(t.featuredNote)}</p>`
		);
	}
	if (maUlubione) {
		sekcje.push(
			tytul(t.favorites) +
				tabela(ulubione, (f, ostatni) =>
					wiersz(
						mecz(f.fixtureId, f.home, f.away),
						f.selection ? `${f.selection}${t.listSeparator}${f.probability}% (${t.usually} ${Math.round(f.base)}%)` : t.favoriteNoPick,
						f.kickoffLocal,
						ostatni
					)
				)
		);
	}
	if (maKolejke) {
		sekcje.push(
			`<p style="margin:0;padding:12px 14px;background:#f1f6f5;border-left:4px solid #173b45;color:#333;font-size:14px;line-height:1.6;">${esc(t.round(round.closesLocal, round.picked, round.total))} <a href="${esc(siteUrl)}/${lang}/pilka-nozna/kolejka" style="color:#173b45;">→</a></p>`
		);
	}
	if (maSkutecznosc) {
		sekcje.push(
			tytul(t.accuracy) +
				`<p style="margin:12px 0 0 0;color:#333;font-size:14px;line-height:1.6;">${esc(t.accuracyLine(skutecznosc.won, skutecznosc.total, pct(skutecznosc.won, skutecznosc.total), Math.round(skutecznosc.base)))} <a href="${esc(siteUrl)}/${lang}/pilka-nozna/skutecznosc" style="color:#173b45;">→</a></p>`
		);
	}
	H.push(sekcje.join(ODSTEP));

	// Stopka oddzielona kreską: asystent, zastrzeżenie, okres próbny, wypisanie.
	H.push(`<div style="margin-top:32px;padding-top:20px;border-top:1px solid #e3e7ea;">`);
	if (maMeczePrzedNami) {
		H.push(`<p style="margin:0 0 14px 0;color:#555;font-size:14px;line-height:1.6;">${esc(t.assistant)} <a href="${esc(siteUrl)}/${lang}/pilka-nozna/asystent" style="color:#173b45;font-weight:700;">${esc(t.assistantLink)}</a></p>`);
	}
	H.push(`<p style="margin:0;color:#888;font-size:13px;line-height:1.6;">${esc(maMeczePrzedNami ? t.disclaimer : t.disclaimerShort)}</p>`);
	if (trialDaysLeft > 0) {
		H.push(`<p style="margin:18px 0 0 0;padding:12px 14px;background:#f1f6f5;border-left:4px solid #173b45;color:#333;font-size:14px;line-height:1.6;">${esc(t.whyTrial(trialDaysLeft))} <a href="${esc(siteUrl)}/${lang}/cennik" style="color:#173b45;font-weight:700;">${esc(t.seePlans)}</a></p>`);
		H.push(`<p style="margin:14px 0 0 0;color:#aaa;font-size:12px;line-height:1.6;"><a href="${esc(unsubscribeUrl)}" style="color:#888;">${esc(t.unsubscribe)}</a></p>`);
	} else {
		H.push(`<p style="margin:14px 0 0 0;color:#aaa;font-size:12px;line-height:1.6;">${esc(t.why)} <a href="${esc(unsubscribeUrl)}" style="color:#888;">${esc(t.unsubscribe)}</a></p>`);
	}
	H.push(`</div>`);

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
