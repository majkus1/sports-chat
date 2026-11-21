'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Check, Copy, ExternalLink, Link2 } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/Tabs';
import { cn } from '@/lib/utils';

/**
 * Jeden post w czterech formatach (X, Facebook, TikTok, Instagram): podgląd, licznik znaków
 * i przyciski „kopiuj". Treść składa `lib/growth/posts.js`; tu nic nie wychodzi samo — publikuje
 * człowiek, w swoim koncie, po przeczytaniu podglądu.
 *
 * @param {{ title: string, lead?: string, variants: Array<{ id: string, label: string, text: string,
 *   length: number, limit: number, link: string, bioLink?: boolean }> }} props
 */

const URL_RE = /(https?:\/\/\S+)/g;
// Osobny wzorzec bez `g` do sprawdzania kawałków — `test` na wzorcu z `g` pamięta `lastIndex` i co drugi raz kłamie.
const IS_URL = /^https?:\/\//;

function KopiujPrzycisk({ value, label, doneLabel, icon: Icon = Copy, primary = false }) {
	const [ok, setOk] = useState(false);
	const kopiuj = async () => {
		try {
			await navigator.clipboard.writeText(value);
			setOk(true);
			setTimeout(() => setOk(false), 2000);
		} catch {
			/* przeglądarka bez dostępu do schowka — tekst w podglądzie da się zaznaczyć ręcznie */
		}
	};
	return (
		<button
			type="button"
			onClick={kopiuj}
			className={cn(
				'inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold transition-colors',
				primary ? 'border-0 bg-accent text-accent-fg hover:bg-accent-hover' : 'border border-border bg-transparent text-text hover:bg-surface-2'
			)}
		>
			{ok ? <Check size={15} aria-hidden="true" /> : <Icon size={15} aria-hidden="true" />}
			<span aria-live="polite">{ok ? doneLabel : label}</span>
		</button>
	);
}

/** Tekst posta z wyróżnionymi linkami — tak, jak zobaczy go czytelnik. */
function Tresc({ text }) {
	return (
		<p className="whitespace-pre-wrap break-words text-[15px] leading-relaxed text-text">
			{text.split(URL_RE).map((kawalek, i) =>
				IS_URL.test(kawalek) ? (
					<span key={i} className="text-accent">
						{kawalek}
					</span>
				) : (
					<span key={i}>{kawalek}</span>
				)
			)}
		</p>
	);
}

export default function PostVariants({ title, lead, variants }) {
	const t = useTranslations('growth');
	if (!variants?.length) return null;
	return (
		<section className="mt-10">
			<h2 className="font-display text-xl font-bold uppercase tracking-wide text-text">{title}</h2>
			{lead && <p className="mt-1.5 text-sm leading-relaxed text-muted">{lead}</p>}
			<Tabs defaultValue={variants[0].id} className="mt-4">
				<TabsList aria-label={t('posts_formats')}>
					{variants.map((v) => (
						<TabsTrigger key={v.id} value={v.id}>
							{v.label}
						</TabsTrigger>
					))}
				</TabsList>
				{variants.map((v) => {
					const zaDlugi = v.length > v.limit;
					return (
						<TabsContent key={v.id} value={v.id} className="mt-4">
							<div className="rounded-[var(--radius-ui)] border border-border bg-surface p-4 shadow-[var(--shadow-soft)] sm:p-5">
								{/* Podgląd: nagłówek konta jak w aplikacji, żeby od razu było widać, czy tekst „siedzi". */}
								<div className="mb-3 flex items-center gap-2.5">
									<span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand text-xs font-bold text-brand-fg" aria-hidden="true">
										CS
									</span>
									<span className="min-w-0">
										<span className="block text-sm font-bold text-text">Czat Sportowy</span>
										<span className="block text-xs text-muted">{t('posts_preview', { channel: v.label })}</span>
									</span>
								</div>
								<Tresc text={v.text} />
								<p className={cn('mt-3 text-xs tabular-nums', zaDlugi ? 'font-bold text-loss' : 'text-muted')}>
									{t(v.id === 'x' ? 'posts_chars_x' : 'posts_chars', { n: v.length, limit: v.limit })}
								</p>
							</div>

							{v.bioLink && (
								<div className="mt-3 rounded-[var(--radius-ui)] bg-surface-2 px-4 py-3">
									<p className="text-xs font-semibold text-text">{t('posts_bio_title')}</p>
									<p className="mt-1 break-all font-mono text-xs text-muted">{v.link}</p>
								</div>
							)}

							<div className="mt-3 flex flex-wrap items-center gap-2">
								<KopiujPrzycisk value={v.text} label={t('posts_copy')} doneLabel={t('posts_copied')} primary />
								<KopiujPrzycisk value={v.link} label={t(v.bioLink ? 'posts_copy_bio' : 'posts_copy_link')} doneLabel={t('posts_copied')} icon={Link2} />
								{v.id === 'x' && (
									<a
										href={`https://x.com/intent/tweet?text=${encodeURIComponent(v.text)}`}
										target="_blank"
										rel="noopener noreferrer"
										className="inline-flex items-center gap-2 rounded-full bg-black px-4 py-2 text-sm font-bold text-white no-underline transition-opacity hover:opacity-85"
									>
										<ExternalLink size={15} aria-hidden="true" />
										{t('posts_open_x')}
									</a>
								)}
							</div>
						</TabsContent>
					);
				})}
			</Tabs>
		</section>
	);
}
