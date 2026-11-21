/* PLIK GENEROWANY — nie edytować ręcznie. Korekta szansy modelu per selekcja (zasady: chanceCalibration.js);
 * odtworzenie: node --experimental-loader ./test/helpers/alias.mjs lib/model/chanceCalibration.mjs --emit=lib/model/chanceCalibrationData.js */
export default {
	"version": "chance-cal/2026-11-21",
	"generatedAt": "2026-11-21",
	"through": "2026-11-16",
	"hints": 1461,
	"selections": {
		"1X": {
			"n": 200,
			"shift": -0.293,
			"enabled": false,
			"reason": "za_krotki_sprawdzian",
			"check": null
		},
		"X2": {
			"n": 553,
			"shift": -0.207,
			"enabled": false,
			"reason": "sprawdzian_nie_potwierdza",
			"check": {
				"n": 403,
				"weeks": 5,
				"promised": 0.7543,
				"calibrated": 0.7035,
				"hit": 0.737,
				"brierRaw": 0.1897,
				"brierCalibrated": 0.1916
			}
		},
		"away": {
			"n": 160,
			"shift": -0.152,
			"enabled": false,
			"reason": "za_krotki_sprawdzian",
			"check": null
		},
		"home": {
			"n": 418,
			"shift": -0.005,
			"enabled": false,
			"reason": "sprawdzian_nie_potwierdza",
			"check": {
				"n": 268,
				"weeks": 5,
				"promised": 0.7069,
				"calibrated": 0.7001,
				"hit": 0.6903,
				"brierRaw": 0.2081,
				"brierCalibrated": 0.2086
			}
		},
		"homeScores": {
			"n": 8,
			"shift": 0,
			"enabled": false,
			"reason": "za_mala_proba",
			"check": null
		},
		"over25": {
			"n": 16,
			"shift": 0,
			"enabled": false,
			"reason": "za_mala_proba",
			"check": null
		}
	}
};
