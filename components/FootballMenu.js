'use client';

import { useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Link, usePathname } from '@/i18n/routing';

/**
 * Nawigacja sekcji piłkarskiej.
 *
 * Na wąskim ekranie w pasie mieszczą się tylko dwie pierwsze pozycje — reszta chowa się
 * pod „⋯". Na szerokim wszystkie stoją obok siebie. Podział steruje jedną stałą poniżej,
 * a nie trzema kopiami tego samego JSX-a, jak było wcześniej.
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

	const isActive = (item) => !item.isButton && pathname === item.href;

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
				{primaryItems.map((item) => (
					<span key={item.key} className="football-menu-item">
						<MenuItem item={item} isActive={isActive(item)} />
					</span>
				))}

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
								{secondaryItems.map((item) => (
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
			</div>

			<style>{`
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
