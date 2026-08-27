import Image from 'next/image';
import { cn } from '@/lib/utils';

/**
 * Znak marki w nagłówku.
 *
 * Źródłem jest `public/img/logo-mark.png` — przycięty wariant `logo.png`. Oryginał ma
 * 2006×784 px, ale sam znak zajmuje w nim tylko 724×576 px, czyli 13% powierzchni;
 * reszta to przezroczysty margines. Użyty wprost dawałby w pasie nagłówka znak wielkości
 * połowy dostępnej wysokości, otoczony pustką. Wersja przycięta wypełnia swoje pole
 * w całości i waży 93 KB zamiast 322 KB.
 *
 * Tło pliku jest w pełni przezroczyste, więc znak działa w obu motywach bez podmiany.
 */

/** Proporcje przyciętego pliku: 321 × 256. */
const NATIVE_WIDTH = 321;
const NATIVE_HEIGHT = 256;

/** Wysokość w nagłówku; szerokość wynika z proporcji. */
const DISPLAY_HEIGHT = 44;
const DISPLAY_WIDTH = Math.round((DISPLAY_HEIGHT * NATIVE_WIDTH) / NATIVE_HEIGHT);

export default function Logo({ locale = 'pl', className }) {
	const title = locale === 'en' ? 'Sports Chat' : 'Czat Sportowy';

	return (
		<Image
			src="/img/logo-mark.png"
			alt={title}
			width={DISPLAY_WIDTH}
			height={DISPLAY_HEIGHT}
			// Logo jest nad linią zgięcia — bez `priority` przeglądarka odkłada je na później
			// i w pasie nagłówka przez moment ziała dziura.
			priority
			className={cn('h-11 w-auto select-none', className)}
		/>
	);
}
