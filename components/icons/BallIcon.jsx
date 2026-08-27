import { cn } from '@/lib/utils';

/**
 * Ikona dyscypliny — `public/img/football-new.png` nałożony jako maska CSS.
 *
 * Plik jest jednobarwny: 128×128 px, każdy widoczny piksel to czysta biel na przezroczystym
 * tle. Wstawiony zwykłym `<img>` byłby niewidoczny w motywie jasnym, a osobny, przemalowany
 * plik na drugi motyw oznaczałby dwa zasoby do utrzymania i podmianę zależną od motywu.
 *
 * Maska rozwiązuje to jednym plikiem: kształt pochodzi z PNG, a kolor z `currentColor`,
 * więc ikona bierze barwę stąd, gdzie akurat stoi — akcent w plakietce dyscypliny, kolor
 * tekstu w menu — i sama nadąża za przełącznikiem motywu.
 */
export default function BallIcon({ className, ...props }) {
	return (
		<span
			aria-hidden="true"
			className={cn('sport-icon-mask inline-block h-6 w-6 shrink-0 bg-current', className)}
			{...props}
		/>
	);
}
