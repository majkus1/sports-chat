/**
 * Schemat odpowiedzi analizy meczu.
 *
 * Wymuszanie kształtu na poziomie API zastępuje dotychczasowe parsowanie odpowiedzi
 * regexem `/Przewidywanie:\s*(.+)$/i` — ten działał wyłącznie po polsku, więc analizy
 * angielskie nigdy nie miały wyodrębnionej prognozy.
 *
 * Uwaga: schematy nie obsługują ograniczeń liczbowych (`minimum`/`maximum`) ani
 * długości tekstu — zakresy opisujemy w prompcie, nie w schemacie.
 */

const KEY_FACTOR = {
	type: 'object',
	properties: {
		title: { type: 'string' },
		detail: { type: 'string' },
		favors: { type: 'string', enum: ['home', 'away', 'neutral'] },
	},
	required: ['title', 'detail', 'favors'],
	additionalProperties: false,
};

const PICK = {
	type: 'object',
	properties: {
		market: { type: 'string' },
		selection: { type: 'string' },
		/*
		 * Prawdopodobieństwo zdarzenia w procentach — pole dodane, bo go brakowało.
		 *
		 * Typ z analizy niósł dotąd wyłącznie `confidence`, czyli „jak mocno dane wspierają
		 * ten typ". To co innego niż szansa, że zdarzenie zajdzie, a progi wejścia i cała
		 * kalibracja opierają się właśnie na prawdopodobieństwie. Bez tego pola instrukcja
		 * „typuj tylko powyżej 85%" odnosiła się do liczby, której model nie miał gdzie podać,
		 * a panel skuteczności nie miał czego kalibrować — typy z analiz zapisywały się
		 * z `probability: null`.
		 */
		probability: { type: 'integer' },
		/** 0–100; zakres pilnowany instrukcją w prompcie. */
		confidence: { type: 'integer' },
		rationale: { type: 'string' },
	},
	required: ['market', 'selection', 'probability', 'confidence', 'rationale'],
	additionalProperties: false,
};

/** Jeden typ w raporcie zbiorczym — patrz REPORT_SCHEMA. */
const REPORT_PICK = {
	type: 'object',
	properties: {
		fixtureId: { type: 'integer' },
		match: { type: 'string' },
		league: { type: 'string' },
		/** ISO 8601 z pakietu danych — front formatuje na czas lokalny. */
		kickoffUtc: { type: 'string' },
		market: { type: 'string' },
		selection: { type: 'string' },
		/** 0–100; zakres pilnowany instrukcją w prompcie. */
		probability: { type: 'integer' },
		confidence: { type: 'integer' },
		analysis: { type: 'string' },
		keyFacts: { type: 'array', items: { type: 'string' } },
	},
	required: [
		'fixtureId',
		'match',
		'league',
		'kickoffUtc',
		'market',
		'selection',
		'probability',
		'confidence',
		'analysis',
		'keyFacts',
	],
	additionalProperties: false,
};

/**
 * Schemat raportu zbiorczego (kilka–kilkanaście typów z różnych meczów).
 *
 * `picks` może być krótszy niż lista kandydatów — model ma prawo odrzucić mecz,
 * w którym sygnały są sprzeczne. Pusta tablica też jest poprawna: raport wtedy
 * uczciwie mówi, że oferta danego okna jest uboga.
 */
export const REPORT_SCHEMA = {
	type: 'object',
	properties: {
		intro: { type: 'string' },
		picks: { type: 'array', items: REPORT_PICK },
		summary: { type: 'string' },
	},
	required: ['intro', 'picks', 'summary'],
	additionalProperties: false,
};

export const MATCH_ANALYSIS_SCHEMA = {
	type: 'object',
	properties: {
		summary: { type: 'string' },
		keyFactors: { type: 'array', items: KEY_FACTOR },
		probabilities: {
			type: 'object',
			properties: {
				home: { type: 'integer' },
				draw: { type: 'integer' },
				away: { type: 'integer' },
			},
			required: ['home', 'draw', 'away'],
			additionalProperties: false,
		},
		goals: {
			type: 'object',
			properties: {
				expectedTotal: { type: 'number' },
				over25: { type: 'integer' },
				btts: { type: 'integer' },
			},
			required: ['expectedTotal', 'over25', 'btts'],
			additionalProperties: false,
		},
		picks: { type: 'array', items: PICK },
		risks: { type: 'array', items: { type: 'string' } },
		dataQuality: { type: 'string', enum: ['good', 'limited', 'insufficient'] },
	},
	required: ['summary', 'keyFactors', 'probabilities', 'goals', 'picks', 'risks', 'dataQuality'],
	additionalProperties: false,
};
