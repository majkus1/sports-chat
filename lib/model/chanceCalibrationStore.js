import mongoose from 'mongoose';
import ChanceCalibration from '@/models/ChanceCalibration';
import { setActiveCalibration, activeCalibration } from '@/lib/model/chanceCalibration';
import DANE from '@/lib/model/chanceCalibrationData';

/**
 * Korekta szansy w BAZIE: odczyt aktywnej wersji, włączenie nowej, wycofanie do poprzedniej.
 *
 * ODCZYT co `REFRESH_MS` (kwadrans) z `getLeagueModel` — każda droga do szansy modelu i tak tamtędy
 * przechodzi, a `calibrateChance` zostaje synchroniczne. Bez połączenia z bazą (testy, skrypty)
 * nic nie pytamy: obowiązuje plik danych z repozytorium. Błąd zapytania zostawia to, co było —
 * lepiej wczorajsza korekta niż nagły powrót do surowych liczb.
 *
 * Dwa procesy (Next i `server.js`) czytają tę samą bazę, więc po włączeniu nowej wersji w zadaniu
 * tygodniowym obie strony mają ją najpóźniej po kwadransie, bez restartu.
 */

const REFRESH_MS = 15 * 60 * 1000;
const RETRY_MS = 60 * 1000;
export const PROD_SCOPE = 'prod';

let nastepne = 0;
let trwa = null;

/** Dokument z bazy → zapis w kształcie pliku danych (to czyta `calibrateChance`). */
export function toCalibrationData(doc) {
	if (!doc) return null;
	return {
		version: doc.version,
		generatedAt: doc.generatedAt ?? null,
		through: doc.through ?? null,
		hints: doc.hints ?? null,
		selections: doc.selections || {},
		source: 'db',
		activatedAt: doc.activatedAt ?? null,
	};
}

/** Aktywna wersja w bazie albo `null`. */
export async function loadActiveCalibration({ scope = PROD_SCOPE } = {}) {
	return ChanceCalibration.findOne({ scope, active: true }).sort({ activatedAt: -1 }).lean();
}

/**
 * Odświeża korektę obowiązującą w procesie. Nigdy nie rzuca.
 *
 * @param {{ force?: boolean, now?: number }} [options]
 */
export async function refreshActiveCalibration({ force = false, now = Date.now() } = {}) {
	if (!force && now < nastepne) return activeCalibration();
	if (mongoose.connection?.readyState !== 1) return activeCalibration();
	if (trwa) return trwa;
	trwa = (async () => {
		try {
			const doc = await loadActiveCalibration();
			setActiveCalibration(toCalibrationData(doc));
			nastepne = now + REFRESH_MS;
		} catch (error) {
			console.warn('[calibration] odczyt korekty z bazy nie powiódł się — zostaje dotychczasowa:', error.message);
			nastepne = now + RETRY_MS;
		} finally {
			trwa = null;
		}
		return activeCalibration();
	})();
	return trwa;
}

/** Obowiązująca korekta dla zadania tygodniowego: z bazy, a gdy jej nie ma — plik danych. */
export async function currentCalibration({ scope = PROD_SCOPE } = {}) {
	const doc = await loadActiveCalibration({ scope });
	return doc ? toCalibrationData(doc) : { ...DANE, source: 'file' };
}

/**
 * Włącza nową wersję: nowa aktywna, dotychczasowa → `superseded` (zostaje do wycofania).
 * Kolejność: najpierw wstawienie, potem wyłączenie starej — w krótkiej chwili dwóch aktywnych
 * odczyt bierze najnowszą (`activatedAt`), więc nie ma momentu bez żadnej.
 *
 * @returns {Promise<object>} zapisany dokument
 */
export async function activateCalibration(data, { scope = PROD_SCOPE, previousVersion = null, reportId = null, source = 'weekly', now = new Date() } = {}) {
	const poprzednia = await loadActiveCalibration({ scope });
	let version = data.version;
	// Drugi przebieg tego samego dnia (np. ręczny) — wersja musi zostać unikalna.
	if (await ChanceCalibration.exists({ scope, version })) version = `${version}-${now.getTime().toString(36)}`;
	const doc = await ChanceCalibration.create({
		version,
		scope,
		status: 'active',
		active: true,
		generatedAt: data.generatedAt ?? null,
		through: data.through ?? null,
		hints: data.hints ?? null,
		selections: data.selections,
		previousVersion: poprzednia?.version ?? previousVersion,
		source,
		activatedAt: now,
		reportId,
	});
	if (poprzednia) {
		await ChanceCalibration.updateOne(
			{ _id: poprzednia._id },
			{ $set: { active: false, status: 'superseded', deactivatedAt: now } }
		);
	}
	if (scope === PROD_SCOPE) await refreshActiveCalibration({ force: true });
	return doc.toObject();
}

/**
 * Wycofuje aktywną wersję: ona → `rolled_back`, jej poprzedniczka z bazy znów aktywna. Gdy
 * poprzedniczką był plik danych (pierwsza wersja z bazy), po wycofaniu obowiązuje plik.
 *
 * @returns {Promise<{ rolledBack: string|null, active: string }>} `active` — wersja obowiązująca po zmianie
 */
export async function rollbackCalibration({ scope = PROD_SCOPE, now = new Date() } = {}) {
	const aktywna = await loadActiveCalibration({ scope });
	if (!aktywna) return { rolledBack: null, active: DANE.version };
	await ChanceCalibration.updateOne({ _id: aktywna._id }, { $set: { active: false, status: 'rolled_back', deactivatedAt: now } });
	let wynik = DANE.version;
	if (aktywna.previousVersion) {
		const poprzednia = await ChanceCalibration.findOneAndUpdate(
			{ scope, version: aktywna.previousVersion },
			{ $set: { active: true, status: 'active', activatedAt: now, deactivatedAt: null } },
			{ new: true }
		).lean();
		if (poprzednia) wynik = poprzednia.version;
	}
	if (scope === PROD_SCOPE) await refreshActiveCalibration({ force: true });
	return { rolledBack: aktywna.version, active: wynik };
}

/** Historia wersji do panelu — najnowsze pierwsze. */
export async function calibrationHistory({ scope = PROD_SCOPE, limit = 20 } = {}) {
	return ChanceCalibration.find({ scope }).sort({ activatedAt: -1 }).limit(limit).lean();
}
