'use client';

import NavBar from '@/components/NavBar';
import Footer from '@/components/layout/Footer';
import { TooltipProvider } from '@/components/ui/Tooltip';
import { cn } from '@/lib/utils';

/**
 * Wspólna powłoka strony.
 *
 * Do tej pory każda strona sama renderowała <NavBar /> i wklejała `margin-top: 150px`,
 * żeby ominąć przyklejony nagłówek. Odstęp jest tu jeden, a stopka wreszcie istnieje.
 *
 * `topOffset` odpowiada wysokości nagłówka o stałej pozycji — zniknie, gdy nawigacja
 * przejdzie na sticky w Etapie 3.
 */
export default function AppShell({
	children,
	onLanguageChange,
	className,
	contentClassName,
	withFooter = true,
	topOffset = true,
}) {
	return (
		<TooltipProvider delayDuration={200}>
			<div className={cn('flex min-h-screen flex-col', className)}>
				<NavBar onLanguageChange={onLanguageChange} />
				<main className={cn('flex-1 px-5', topOffset && 'mt-[150px]', contentClassName)}>
					{children}
				</main>
				{withFooter && <Footer />}
			</div>
		</TooltipProvider>
	);
}
