'use client';

import { useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { ChevronDown, Sparkles } from 'lucide-react';
import { Link, usePathname } from '@/i18n/routing';
import GuideModal from '@/components/football/GuideModal';

/**
 * Nawigacja sekcji piłkarskiej.
 *
 * MNIEJ POZYCJI NA WIERZCHU. Dawniej pasek miał dziesięć wejść (sześć zakładek, „Typy na dziś",
 * „Wszystkie narzędzia", przewodnik i asystent) — gracz widział ścianę przycisków. Teraz na
 * wierzchu stoją cztery najczęściej klikane strony i asystent, a reszta (wyniki, raport AI,
 * kolejka, przewodnik, wszystkie narzędzia) jest pod „Więcej". Każda funkcja zostaje osiągalna,
 * a pełna lista z opisami jest na stronie „Narzędzia".
 *
 * Na wąskim ekranie w pasie mieszczą się trzy pierwsze pozycje — pozostałe z pasa dochodzą
 * na górę listy „Więcej". Podział steruje jedną stałą poniżej.
 *
 * ASYSTENT TO NIE ZAKŁADKA, TYLKO WEJŚCIE. Stoi poza listą zakładek, jako wyróżniona pigułka
 * z iskrą — na każdym rozmiarze ekranu. Na komputerze po prawej stronie paska, na telefonie
 * jako szeroki przycisk w osobnym rzędzie pod zakładkami. Wygląda jak przycisk akcji, nie jak
 * podkreślona pozycja, więc nie myli się z tym, gdzie użytkownik akurat jest.
 */

/** Ile pozycji pasa zostaje na telefonie. Reszta pasa ląduje na górze listy „Więcej". */
const VISIBLE_ON_MOBILE = 3;

function MenuItem({ item, isActive, onSelect, className = '' }) {
	const cls = `pre-match-p ${isActive ? 'active-section' : ''} ${className}`;

	if (item.isButton) {
		return (
			<button
				type="button"
				className={cls}
				onClick={() => {
					item.onClick?.();
					onSelect?.();
				}}
			>
				{item.label}
			</button>
		);
	}

	return (
		<Link href={item.href} className={cls} onClick={onSelect}>
			{item.label}
		</Link>
	);
}

export default function FootballMenu({ onResultsClick }) {
	const t = useTranslations('common');
	const tp = useTranslations('ux_p4');
	const pathname = usePathname();
	const [isMenuExpanded, setIsMenuExpanded] = useState(false);
	/*
	 * Przewodnik jest stanem menu, nie strony: menu stoi na sześciu stronach, a modal ma
	 * być wszędzie ten sam. Dzięki temu żadna z nich nie musi o nim wiedzieć.
	 */
	const [isGuideOpen, setIsGuideOpen] = useState(false);
	const wrapperRef = useRef(null);

	/* Pas: to, po co gracz przychodzi — typy, mecze przed gwizdkiem, mecze na żywo i dowód skuteczności. */
	const menuItems = [
		{ href: '/typy-na-dzis', label: t('today_picks_menu'), key: 'typy-na-dzis' },
		{ href: '/pilka-nozna/przedmeczowe', label: t('match'), key: 'przedmeczowe' },
		{ href: '/pilka-nozna/live', label: t('onlive'), key: 'live' },
		{ href: '/pilka-nozna/skutecznosc', label: t('accuracy_menu'), key: 'skutecznosc' },
	];

	/* Pod „Więcej" — rzadziej klikane, ale każda osiągalna jednym rozwinięciem. */
	const moreItems = [
		{ onClick: onResultsClick, label: t('results'), key: 'results', isButton: true },
		{ href: '/pilka-nozna/ai-agent', label: t('ai_agent_title'), key: 'ai-agent' },
		{ href: '/pilka-nozna/kolejka', label: t('round_menu'), key: 'kolejka' },
		{ onClick: () => setIsGuideOpen(true), label: t('guide_menu'), key: 'guide', isButton: true },
		{ href: '/narzedzia', label: t('tools_menu_all'), key: 'narzedzia' },
	];

	const mobileOverflow = menuItems.slice(VISIBLE_ON_MOBILE);

	const isActive = (item) => !item.isButton && pathname === item.href;
	const naAsystencie = pathname === '/pilka-nozna/asystent';
	// Bieżąca strona schowana pod „Więcej" — podkreślamy przycisk, żeby było widać, gdzie się jest.
	const activeInMore = moreItems.some(isActive);

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

	const close = () => setIsMenuExpanded(false);

	return (
		<>
			<div ref={wrapperRef} className="choose-time football-menu-wrapper">
				{menuItems.map((item, i) => (
					<span key={item.key} className={`football-menu-item ${i >= VISIBLE_ON_MOBILE ? 'menu-desktop-only' : ''}`}>
						<MenuItem item={item} isActive={isActive(item)} />
					</span>
				))}

				<span className="football-more">
					<button
						type="button"
						onClick={() => setIsMenuExpanded((open) => !open)}
						className={`pre-match-p football-more-button ${activeInMore ? 'active-section' : ''}`}
						aria-expanded={isMenuExpanded}
						aria-haspopup="true"
						aria-label={tp('menu_more')}
					>
						{/* Na telefonie sam „⋯" — napis „Więcej" zepchnąłby przycisk do drugiego rzędu przy 320 px. */}
						<span className="football-more-label">{tp('menu_more')}</span>
						<ChevronDown size={14} aria-hidden="true" className={`football-more-label ${isMenuExpanded ? 'rotate-180' : ''}`} />
						<span className="football-more-dots" aria-hidden="true">⋯</span>
					</button>

					{isMenuExpanded && (
						<div className="menu-expanded">
							{/* Pozycje pasa, które na telefonie się nie zmieściły — na komputerze CSS je chowa. */}
							{mobileOverflow.map((item) => (
								<MenuItem key={item.key} item={item} isActive={isActive(item)} onSelect={close} className="menu-mobile-only" />
							))}
							{moreItems.map((item) => (
								<MenuItem key={item.key} item={item} isActive={isActive(item)} onSelect={close} />
							))}
						</div>
					)}
				</span>

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
        .football-menu-wrapper {
          display: flex;
          gap: 22px;
          flex-wrap: wrap;
          align-items: center;
          position: relative;
          margin-bottom: 18px;
        }

        .football-menu-item,
        .football-more {
          display: inline-flex;
          align-items: center;
        }

        .football-more {
          position: relative;
        }

        /* Reguła .choose-time .pre-match-p z arkusza ma wyższą specyficzność — ta musi ją przebić. */
        .choose-time .football-more-button {
          gap: 3px;
          border: 0;
          background: transparent;
        }

        .football-more-button svg {
          transition: transform 0.15s ease;
        }

        .football-more-dots {
          display: none;
          font-size: 20px;
          line-height: 1;
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

        /* Lista „Więcej" pod przyciskiem — na każdym ekranie. */
        .menu-expanded {
          display: flex;
          flex-direction: column;
          position: absolute;
          top: 100%;
          left: 0;
          min-width: 200px;
          background: var(--surface);
          border: 1px solid var(--border);
          border-radius: 10px;
          box-shadow: var(--shadow-soft);
          padding: 6px;
          margin-top: 6px;
          z-index: 100;
          animation: slideDown 0.18s ease-out;
        }

        /* W rozwijanej liście pozycje są wierszami, więc gubią odstęp i podkreślenie z paska poziomego. */
        .choose-time .menu-expanded .pre-match-p {
          display: block;
          width: 100%;
          margin-top: 0;
          padding: 9px 10px;
          border: 0;
          border-radius: 7px;
          background: transparent;
          text-align: left;
        }

        .choose-time .menu-expanded .pre-match-p:hover {
          background: var(--surface-2);
        }

        .menu-expanded .active-section::after {
          display: none;
        }

        .choose-time .menu-expanded .menu-mobile-only {
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

        @media (max-width: 768px) {
          /* Trzy pozycje i „Więcej" w jednym rzędzie od 320 px — stąd mniejszy odstęp. */
          .football-menu-wrapper {
            gap: 16px;
          }

          .menu-desktop-only,
          .football-more-label {
            display: none;
          }

          .football-more-dots {
            display: inline;
          }

          .choose-time .menu-expanded .menu-mobile-only {
            display: block;
          }

          /* „Więcej" stoi przy prawej krawędzi — lista otwiera się w lewo, żeby nie wyjść za ekran. */
          .menu-expanded {
            left: auto;
            right: 0;
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
        }
      `}</style>
		</>
	);
}
