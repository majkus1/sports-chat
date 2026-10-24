'use client';

import { useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Blocks, CircleHelp, ListChecks, Sparkles } from 'lucide-react';
import { Link, usePathname } from '@/i18n/routing';
import GuideModal from '@/components/football/GuideModal';

/**
 * Nawigacja sekcji piłkarskiej.
 *
 * Na wąskim ekranie w pasie mieszczą się tylko dwie pierwsze pozycje — reszta chowa się
 * pod „⋯". Na szerokim wszystkie stoją obok siebie. Podział steruje jedną stałą poniżej,
 * a nie trzema kopiami tego samego JSX-a, jak było wcześniej.
 *
 * ASYSTENT TO NIE ZAKŁADKA, TYLKO WEJŚCIE. Stoi poza listą zakładek, jako wyróżniona pigułka
 * z iskrą — na każdym rozmiarze ekranu. Na komputerze po prawej stronie paska, na telefonie
 * jako szeroki przycisk w osobnym rzędzie pod zakładkami (w jednym pasie z nimi się nie mieści:
 * ~379 px przy 343 dostępnych). Wygląda jak przycisk akcji, nie jak podkreślona pozycja, więc
 * nie myli się z tym, gdzie użytkownik akurat jest; na samej stronie asystenta wypełnia się kolorem.
 */

/** Ile pozycji zostaje w pasie na telefonie. Reszta ląduje w rozwijanym menu. */
const VISIBLE_ON_MOBILE = 2;

function MenuItem({ item, isActive, onSelect }) {
	const className = `pre-match-p ${isActive ? 'active-section' : ''}`;

	if (item.isButton) {
		return (
			<button
				type="button"
				className={className}
				onClick={() => {
					item.onClick();
					onSelect?.();
				}}
			>
				{item.label}
			</button>
		);
	}

	return (
		<Link href={item.href} className={className} onClick={onSelect}>
			{item.label}
		</Link>
	);
}

export default function FootballMenu({ onResultsClick }) {
	const t = useTranslations('common');
	const pathname = usePathname();
	const [isMenuExpanded, setIsMenuExpanded] = useState(false);
	/*
	 * Przewodnik jest stanem menu, nie strony: menu stoi na sześciu stronach, a modal ma
	 * być wszędzie ten sam. Dzięki temu żadna z nich nie musi o nim wiedzieć.
	 */
	const [isGuideOpen, setIsGuideOpen] = useState(false);
	const wrapperRef = useRef(null);

	const menuItems = [
		{ href: '/pilka-nozna/przedmeczowe', label: t('match'), key: 'przedmeczowe' },
		{ href: '/pilka-nozna/live', label: t('onlive'), key: 'live' },
		{ onClick: onResultsClick, label: t('results'), key: 'results', isButton: true },
		{ href: '/pilka-nozna/ai-agent', label: t('ai_agent_title'), key: 'ai-agent' },
		{ href: '/pilka-nozna/kolejka', label: t('round_menu'), key: 'kolejka' },
		{ href: '/pilka-nozna/skutecznosc', label: t('accuracy_menu'), key: 'skutecznosc' },
	];

	const primaryItems = menuItems.slice(0, VISIBLE_ON_MOBILE);
	const secondaryItems = menuItems.slice(VISIBLE_ON_MOBILE);

	/*
	 * „Typy na dziś" — poza pasem zakładek, bo pas jest pełny (patrz odnośnik „Wszystkie narzędzia"
	 * niżej). Na komputerze stoi obok tego odnośnika, w rzędzie plakietki „Piłka nożna"; na telefonie
	 * jest pierwszą pozycją pod „⋯". Wcześniej z paska piłki nie było do tej strony drogi wcale.
	 */
	const todayItem = { href: '/typy-na-dzis', label: t('today_picks_menu'), key: 'typy-na-dzis' };

	const isActive = (item) => !item.isButton && pathname === item.href;
	const naAsystencie = pathname === '/pilka-nozna/asystent';

	/** Kliknięcie poza menu i Escape zamykają listę — bez tego zostaje otwarta po wyborze. */
	useEffect(() => {
		if (!isMenuExpanded) return undefined;

		const onPointerDown = (event) => {
			if (!wrapperRef.current?.contains(event.target)) setIsMenuExpanded(false);
		};
		const onKeyDown = (event) => {
			if (event.key === 'Escape') setIsMenuExpanded(false);
		};

		document.addEventListener('pointerdown', onPointerDown);
		document.addEventListener('keydown', onKeyDown);
		return () => {
			document.removeEventListener('pointerdown', onPointerDown);
			document.removeEventListener('keydown', onKeyDown);
		};
	}, [isMenuExpanded]);

	return (
		<>
			<div ref={wrapperRef} className="choose-time football-menu-wrapper">
				{/*
				 * Wszystkie narzędzia — w rzędzie plakietki „Piłka nożna", po prawej, a nie w pasie.
				 * Pas jest pełny: na stronach z panelem bocznym zajmuje 783 z 790 px (zmierzone przy
				 * 1280 px), więc każda kolejna pozycja zrzucałaby pigułkę asystenta do drugiego rzędu.
				 * Pozycja bezwzględna nie zabiera miejsca w pasie; plakietka stoi nad menu na każdej
				 * z sześciu stron, które go używają. Na telefonie krótszy napis, żeby zmieścić się obok.
				 *
				 * Na komputerze w tym samym rzędzie stoją też „Typy na dziś" — miejsca jest tam dość
				 * (szacunkowo plakietka i dwa odnośniki to ~450 px przy co najmniej ~560 px szerokości
				 * treści, gdy obok stoi panel boczny). Na telefonie ich tu nie ma — są pod „⋯".
				 */}
				<div className="football-top-links">
					<Link href={todayItem.href} className="football-tools-link football-today-link">
						<ListChecks size={14} aria-hidden="true" />
						<span>{todayItem.label}</span>
					</Link>
					<Link href="/narzedzia" className="football-tools-link">
						<Blocks size={14} aria-hidden="true" />
						<span className="football-tools-short">{t('tools_menu')}</span>
						<span className="football-tools-long">{t('tools_menu_all')}</span>
					</Link>
				</div>

				{primaryItems.map((item) => (
					<span key={item.key} className="football-menu-item">
						<MenuItem item={item} isActive={isActive(item)} />
					</span>
				))}

				{/*
				 * Przewodnik zawsze w pasie — także na telefonie, gdzie reszta chowa się pod „⋯".
				 * Nowy użytkownik ma go zobaczyć bez rozwijania czegokolwiek; na wąskim ekranie
				 * zostaje sama ikona, żeby nie zabierać miejsca dwóm pierwszym zakładkom.
				 */}
				<span className="football-menu-item">
					<button
						type="button"
						className="pre-match-p guide-button"
						onClick={() => setIsGuideOpen(true)}
						aria-haspopup="dialog"
						aria-label={t('guide_menu')}
					>
						<CircleHelp size={15} aria-hidden="true" />
						<span className="guide-label">{t('guide_menu')}</span>
					</button>
				</span>

				{secondaryItems.length > 0 && (
					<>
						{/* Ten sam zestaw dwa razy: w pasie na szerokim ekranie i w rozwijanym
						    menu na wąskim. Widocznością steruje CSS, nie stan komponentu. */}
						<span className="menu-desktop-items">
							{secondaryItems.map((item) => (
								<span key={item.key} className="football-menu-item">
									<MenuItem item={item} isActive={isActive(item)} />
								</span>
							))}
						</span>

						<button
							type="button"
							onClick={() => setIsMenuExpanded((open) => !open)}
							className="menu-dots-button"
							aria-expanded={isMenuExpanded}
							aria-label={t('menu')}
						>
							⋯
						</button>

						{isMenuExpanded && (
							<div className="menu-expanded">
								{[todayItem, ...secondaryItems].map((item) => (
									<MenuItem
										key={item.key}
										item={item}
										isActive={isActive(item)}
										onSelect={() => setIsMenuExpanded(false)}
									/>
								))}
							</div>
						)}
					</>
				)}

				<Link
					href="/pilka-nozna/asystent"
					className={`assistant-pill ${naAsystencie ? 'is-current' : ''}`}
					aria-current={naAsystencie ? 'page' : undefined}
				>
					<Sparkles size={14} aria-hidden="true" />
					<span>{t('assistant_menu_cta')}</span>
					<span className="assistant-pill-more">· {t('assistant_menu_cta_more')}</span>
				</Link>
			</div>

			<GuideModal open={isGuideOpen} onClose={() => setIsGuideOpen(false)} />

			<style>{`
        /* Reguła .choose-time .pre-match-p z arkusza ma wyższą specyficzność — te muszą ją przebić. */
        .choose-time .guide-button {
          gap: 5px;
          color: var(--accent);
        }

        .choose-time .guide-button:hover {
          color: var(--accent-hover, var(--accent));
        }

        .football-menu-wrapper {
          display: flex;
          gap: 22px;
          flex-wrap: wrap;
          align-items: center;
          position: relative;
          margin-bottom: 18px;
        }

        .football-menu-item {
          display: inline-flex;
          align-items: center;
        }

        /* Wszystkie narzędzia (i na komputerze Typy na dziś): w rzędzie plakietki „Piłka nożna"
           nad paskiem, przy prawej krawędzi. 14 px to górny margines paska (.choose-time), 28 px —
           wysokość plakietki, więc odnośniki stoją w jednej linii z nią i nie przesuwają niczego w pasie. */
        .football-top-links {
          position: absolute;
          right: 0;
          bottom: calc(100% + 14px);
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .football-tools-link {
          display: inline-flex;
          align-items: center;
          gap: 5px;
          height: 28px;
          padding: 0 11px 0 9px;
          border: 1px solid var(--border);
          border-radius: 999px;
          background: var(--surface);
          color: var(--text);
          font-family: 'Roboto Condensed', sans-serif;
          font-size: 12px;
          font-weight: 700;
          letter-spacing: 0.06em;
          text-transform: uppercase;
          text-decoration: none;
          white-space: nowrap;
          transition: border-color 0.15s ease, background 0.15s ease;
        }

        .football-tools-link svg {
          flex-shrink: 0;
          color: var(--accent);
        }

        .football-tools-link:hover {
          border-color: var(--accent);
          background: var(--accent-soft);
        }

        .football-tools-link:focus-visible {
          outline: 2px solid var(--ring);
          outline-offset: 2px;
        }

        .football-tools-short {
          display: none;
        }

        /* Asystent: pigułka akcji po prawej stronie paska, nie kolejna zakładka. */
        .assistant-pill {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          margin-left: auto;
          padding: 6px 13px 6px 11px;
          border-radius: 999px;
          border: 1px solid color-mix(in srgb, var(--accent) 50%, transparent);
          background: var(--accent-soft);
          color: var(--accent);
          font-family: 'Roboto Condensed', sans-serif;
          font-size: 13px;
          font-weight: 700;
          letter-spacing: 0.05em;
          text-transform: uppercase;
          text-decoration: none;
          white-space: nowrap;
          box-shadow: 0 6px 20px -12px var(--accent);
          transition: background 0.15s ease, color 0.15s ease, box-shadow 0.2s ease, transform 0.15s ease;
        }

        .assistant-pill:hover {
          background: var(--accent);
          color: var(--accent-fg);
          box-shadow: 0 8px 22px -10px var(--accent);
          transform: translateY(-1px);
        }

        .assistant-pill.is-current {
          background: var(--accent);
          color: var(--accent-fg);
        }

        .assistant-pill svg {
          flex-shrink: 0;
        }

        .assistant-pill-more {
          display: none;
          font-weight: 600;
          text-transform: none;
          letter-spacing: 0;
        }

        /* Rozwijacz nie nosi klasy .pre-match-p celowo: tamta reguła jest zagnieżdżona
           w .choose-time, więc ma wyższą specyficzność i jej "display" wygrywałby
           z ukrywaniem na desktopie. Własne style zamykają temat bez licytacji. */
        .menu-dots-button {
          display: none;
          align-items: center;
          color: var(--muted);
          font-family: 'Roboto Condensed', sans-serif;
          font-size: 20px;
          line-height: 1;
          padding: 0 4px;
          transition: color 0.15s ease;
        }

        .menu-dots-button:hover {
          color: var(--text);
        }

        .menu-expanded {
          display: none;
        }

        /* Bez wyśrodkowania dzieci rozciągałyby się na wysokość kontenera, a tekst
           siadałby wyżej niż w pozycjach spoza tego opakowania. */
        .menu-desktop-items {
          display: inline-flex;
          align-items: center;
          gap: 22px;
        }

        @media (max-width: 768px) {
          .menu-dots-button {
            display: inline-flex;
          }

          /* Obok plakietki na telefonie mieści się tylko krótki napis (320 px: 143 + 107 z 280).
             Typy na dziś się nie mieszczą — na telefonie są pierwszą pozycją pod „⋯". */
          .football-today-link {
            display: none;
          }

          .football-tools-short {
            display: inline;
          }

          .football-tools-long {
            display: none;
          }

          /* Na telefonie asystent dostaje własny rząd pod zakładkami — szeroki, łatwy do trafienia kciukiem. */
          .assistant-pill {
            order: 10;
            flex-basis: 100%;
            justify-content: center;
            margin-left: 0;
            padding: 9px 14px;
            border-radius: 12px;
          }

          .assistant-pill-more {
            display: inline;
          }

          /* Na telefonie zostaje sama ikona — ale w kółku, żeby dało się w nią trafić kciukiem. */
          .guide-label {
            display: none;
          }

          .choose-time .guide-button {
            justify-content: center;
            width: 30px;
            height: 30px;
            padding: 0;
            border-radius: 999px;
            background: var(--accent-soft);
          }

          .menu-desktop-items {
            display: none;
          }

          .menu-expanded {
            display: flex;
            flex-direction: column;
            position: absolute;
            top: 100%;
            left: 0;
            min-width: 190px;
            background: var(--surface);
            border: 1px solid var(--border);
            border-radius: 10px;
            box-shadow: var(--shadow-soft);
            padding: 6px;
            margin-top: 6px;
            z-index: 100;
            animation: slideDown 0.18s ease-out;
          }

          /* W rozwijanym menu pozycje są wierszami listy, więc gubią odstęp i podkreślenie
             z paska poziomego. */
          .menu-expanded .pre-match-p {
            display: block;
            width: 100%;
            margin-top: 0;
            padding: 9px 10px;
            border-radius: 7px;
            text-align: left;
          }

          .menu-expanded .pre-match-p:hover {
            background: var(--surface-2);
          }

          .menu-expanded .active-section::after {
            display: none;
          }

          @keyframes slideDown {
            from {
              opacity: 0;
              transform: translateY(-6px);
            }
            to {
              opacity: 1;
              transform: translateY(0);
            }
          }
        }
      `}</style>
		</>
	);
}
