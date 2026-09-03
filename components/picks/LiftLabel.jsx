'use client';

import { useTranslations } from 'next-intl';
import { normalizePick } from '@/lib/picks/markets';
import { liftFor, meetsPolicy, entryThresholdFor, countsAsFallback } from '@/lib/picks/policy';
import { cn } from '@/lib/utils';

/**
 * Podpis pod typem: o ile przewyższa normę swojego rynku i czy liczy się do skuteczności.
 *
 * Sam procent nic nie mówi — „84%" brzmi identycznie przy banale i przy odkryciu. Dopiero
 * zestawienie z tym, jak często zdarzenie zachodzi samo z siebie, zamienia liczbę w zdanie
 * z treścią. Normę i przewagę bierzemy z typu, gdy zostały tam zapisane (raport i analiza
 * wiążą je po stronie serwera), a w przeciwnym razie liczymy z nazw drużyn tą samą funkcją,
 * która decyduje o wliczeniu typu do statystyki.
 *
 * KAŻDY TYP MUSI DOSTAĆ PODPIS. Wcześniej komponent zwracał `null`, gdy nie dało się policzyć
 * normy — a to zdarza się dokładnie w dwóch sytuacjach, w których czytelnik NAJBARDZIEJ
 * potrzebuje wyjaśnienia: przy rynku zakazanym pomiarem i przy nazwie, której parser nie
 * rozpoznał. Typ wyglądał wtedy jak każdy inny, choć nie liczył się do niczego. Milczenie
 * było najgorszą z możliwych odpowiedzi.
 */
export default function LiftLabel({
	market,
	selection,
	homeName,
	awayName,
	probability,
	baseRate,
	lift,
	showProbability = false,
	className,
}) {
	const t = useTranslations('common');

	const normalized = normalizePick({ market, selection, homeName, awayName });

	// Norma warunkowa (mecz w trakcie) musi iść do KAŻDEGO rachunku, inaczej próg liczyłby się
	// wobec tabeli, a przewaga wobec aktualnego stanu — i różnica wyszłaby z sufitu.
	const opcje = Number.isFinite(baseRate) ? { base: baseRate } : {};
	const polityka = meetsPolicy(normalized, probability, opcje);

	let base = baseRate;
	let przewaga = lift;
	if (!Number.isFinite(base) || !Number.isFinite(przewaga)) {
		({ base, lift: przewaga } = liftFor(normalized, probability, opcje));
	}

	const maPrzewage = Number.isFinite(base) && Number.isFinite(przewaga);
	const maProcent = Number.isFinite(probability);
	// W trakcie strumienia typ pojawia się przed swoimi liczbami — wtedy naprawdę nie ma co pisać.
	if (!maPrzewage && !maProcent) return null;

	/*
	 * ILE ZABRAKŁO — bez tej liczby podpis wygląda na sprzeczny.
	 *
	 * Czytelnik widzi „o 9 pkt powyżej przeciętnej", co brzmi dobrze, a zaraz obok „typ
	 * zapasowy", co brzmi źle, i nie ma jak połączyć jednego z drugim, bo nigdzie nie stoi,
	 * ile wynosi próg. Podajemy więc różnicę wprost: do pełnego typu zabrakło 3 punktów.
	 */
	const zapasowy = countsAsFallback(polityka.reason);
	const prog = zapasowy ? entryThresholdFor(normalized, opcje) : null;
	const brakuje =
		Number.isFinite(prog) && maProcent ? Math.max(1, prog - probability) : null;

	const ton = maPrzewage && przewaga > 0 && polityka.ok ? 'text-text' : 'text-muted';

	return (
		<p className={cn('text-xs leading-relaxed', ton, className)}>
			{/* Etykieta, bo przy typie stoją dwie różne liczby i trzeba je odróżnić. */}
			{showProbability && maProcent && (
				<>
					{t('report_probability')} <strong className="tabular-nums">{probability}%</strong>
					{maPrzewage || !polityka.ok ? ' · ' : ''}
				</>
			)}

			{maPrzewage &&
				(przewaga > 0
					? t('pick_lift_above', { lift: przewaga, base: Math.round(base) })
					: t('pick_lift_below', { lift: Math.abs(przewaga), base: Math.round(base) }))}

			{/*
			 * Trzy stany, trzy komunikaty. Typ zapasowy LICZY SIĘ do skuteczności i mówimy, ile
			 * mu zabrakło. Typ wykluczony — rynek zakazany pomiarem, zdarzenie pewne dla rynku,
			 * nierozpoznana nazwa — nie liczy się wcale, i to jest zupełnie co innego.
			 */}
			{zapasowy &&
				`${maPrzewage ? ' · ' : ''}${
					brakuje === null
						? t('pick_lift_fallback_plain')
						: t('pick_lift_fallback', { missing: brakuje })
				}`}

			{!polityka.ok && !zapasowy && `${maPrzewage ? ' · ' : ''}${t('pick_lift_excluded')}`}
		</p>
	);
}
