/**
 * Dopasowanie korekty szansy modelu na plakietkach z dziennika prognoz (`ModelForecast`).
 * Zasady i bezpieczniki: `chanceCalibration.js`. TYLKO ODCZYT bazy.
 *
 * URUCHOMIENIE (wymaga bazy):
 *   node --experimental-loader ./test/helpers/alias.mjs lib/model/chanceCalibration.mjs
 *   --emit=lib/model/chanceCalibrationData.js   zapisz plik danych (bez tego tylko raport)
 *   --since=2026-09-18                          plakietki od tej daty
 */

import 'dotenv/config';
import dotenv from 'dotenv';
import fs from 'fs/promises';
import mongoose from 'mongoose';

dotenv.config({ path: '.env.local' });

const ModelForecast = (await import('@/models/ModelForecast')).default;
const { fitSelection, CALIBRATION_MIN_SAMPLE, CALIBRATION_MIN_TEST, CALIBRATION_MAX_POINTS } = await import(
	'@/lib/model/chanceCalibration'
);
const { HINT_TO_SELECTION, settleSelection } = await import('@/lib/model/oddsShadow');
const { isBannedMarket } = await import('@/lib/picks/policy');
const { SELECTION_SHAPES } = await import('@/lib/picks/markets');

const arg = (name, domyslna) => process.argv.find((a) => a.startsWith(`--${name}=`))?.split('=')[1] ?? domyslna;
const EMIT = arg('emit', '');
const SINCE = arg('since', '');

await mongoose.connect(process.env.DATABASE_URL);
const wiersze = await ModelForecast.find({
	'hint.key': { $ne: null },
	'result.home': { $ne: null },
	...(SINCE ? { kickoff: { $gte: new Date(SINCE) } } : {}),
})
	.select('kickoff hint result')
	.sort({ kickoff: 1 })
	.lean();
await mongoose.disconnect();

const wgSelekcji = new Map();
for (const w of wiersze) {
	const key = w.hint.key;
	// Selekcje wyłączone polityką nie dostają korekty — i tak się nie pokażą.
	if (!SELECTION_SHAPES[key] || isBannedMarket(SELECTION_SHAPES[key].normalized)) continue;
	const won = settleSelection(HINT_TO_SELECTION[key], w.result.home, w.result.away);
	// Surowa szansa modelu; starsze zapisy (sprzed korekty) mają ją w `probability`.
	const procent = Number.isFinite(w.hint.raw) ? w.hint.raw : w.hint.probability;
	if (won === null || !Number.isFinite(procent)) continue;
	if (!wgSelekcji.has(key)) wgSelekcji.set(key, []);
	wgSelekcji.get(key).push({ p: procent / 100, won, at: w.kickoff });
}

const selections = {};
console.log(
	`plakietki z wynikiem: ${wiersze.length} (minimum próby ${CALIBRATION_MIN_SAMPLE}, sprawdzianu ${CALIBRATION_MIN_TEST}, limit korekty ${CALIBRATION_MAX_POINTS} pkt)`
);
for (const [key, dane] of [...wgSelekcji].sort()) {
	const w = fitSelection(dane);
	selections[key] = w;
	const s = w.check;
	console.log(
		`  ${key.padEnd(11)} n=${String(w.n).padStart(4)}  przesunięcie ${w.shift.toFixed(3)}  ${w.enabled ? 'WŁĄCZONA' : `bez korekty (${w.reason})`}` +
			(s
				? `  | tydzień po tygodniu n=${s.n} (${s.weeks} tyg.): obiecane ${(100 * s.promised).toFixed(1)}%, po korekcie ${(100 * s.calibrated).toFixed(1)}%, trafione ${(100 * s.hit).toFixed(1)}%, Brier ${s.brierRaw} → ${s.brierCalibrated}`
				: '')
	);
}

if (EMIT) {
	const dzis = new Date().toISOString().slice(0, 10);
	const zapis = {
		version: `chance-cal/${dzis}`,
		generatedAt: dzis,
		through: wiersze.at(-1)?.kickoff?.toISOString().slice(0, 10) ?? null,
		hints: wiersze.length,
		selections,
	};
	const naglowek =
		'/* PLIK GENEROWANY — nie edytować ręcznie. Korekta szansy modelu per selekcja (zasady: chanceCalibration.js);\n' +
		' * odtworzenie: node --experimental-loader ./test/helpers/alias.mjs lib/model/chanceCalibration.mjs --emit=lib/model/chanceCalibrationData.js */\n';
	await fs.writeFile(EMIT, `${naglowek}export default ${JSON.stringify(zapis, null, '\t')};\n`);
	console.log(`zapisano ${EMIT}`);
}
