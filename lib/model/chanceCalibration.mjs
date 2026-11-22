/**
 * Dopasowanie korekty szansy modelu na plakietkach z dziennika prognoz (`ModelForecast`).
 * Zasady i bezpieczniki: `chanceCalibration.js`. TYLKO ODCZYT bazy. Plik danych to zapas na wypadek
 * braku aktywnej wersji w bazie; co tydzień korektę liczy i (z bezpiecznikami) włącza samo
 * zadanie `weeklyJob.js` — ten skrypt jest do ręcznego podglądu i do odświeżenia zapasu.
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
const { CALIBRATION_MIN_SAMPLE, CALIBRATION_MIN_TEST, CALIBRATION_MAX_POINTS } = await import('@/lib/model/chanceCalibration');
// Ten sam kandydat co w zadaniu tygodniowym (`weeklyCalibration.js`) — jedno źródło próbek i dopasowania.
const { buildCandidate } = await import('@/lib/model/weeklyCalibration');

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

const zapis = buildCandidate(wiersze);
console.log(
	`plakietki z wynikiem: ${wiersze.length} (minimum próby ${CALIBRATION_MIN_SAMPLE}, sprawdzianu ${CALIBRATION_MIN_TEST}, limit korekty ${CALIBRATION_MAX_POINTS} pkt)`
);
for (const [key, w] of Object.entries(zapis.selections)) {
	const s = w.check;
	console.log(
		`  ${key.padEnd(11)} n=${String(w.n).padStart(4)}  przesunięcie ${w.shift.toFixed(3)}  ${w.enabled ? 'WŁĄCZONA' : `bez korekty (${w.reason})`}` +
			(s
				? `  | tydzień po tygodniu n=${s.n} (${s.weeks} tyg.): obiecane ${(100 * s.promised).toFixed(1)}%, po korekcie ${(100 * s.calibrated).toFixed(1)}%, trafione ${(100 * s.hit).toFixed(1)}%, Brier ${s.brierRaw} → ${s.brierCalibrated}`
				: '')
	);
}

if (EMIT) {
	const naglowek =
		'/* PLIK GENEROWANY — nie edytować ręcznie. Korekta szansy modelu per selekcja (zasady: chanceCalibration.js);
' +
		' * odtworzenie: node --experimental-loader ./test/helpers/alias.mjs lib/model/chanceCalibration.mjs --emit=lib/model/chanceCalibrationData.js */
';
	await fs.writeFile(EMIT, `${naglowek}export default ${JSON.stringify(zapis, null, '	')};
`);
	console.log(`zapisano ${EMIT}`);
}
