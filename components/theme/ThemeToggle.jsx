'use client';

import { Moon, Sun } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useTheme } from '@/context/ThemeContext';
import { cn } from '@/lib/utils';

export default function ThemeToggle({ className }) {
	const { theme, toggleTheme } = useTheme();
	const t = useTranslations('common');
	const isDark = theme === 'dark';

	return (
		<button
			type="button"
			onClick={toggleTheme}
			aria-label={isDark ? t('theme_switch_light') : t('theme_switch_dark')}
			title={isDark ? t('theme_switch_light') : t('theme_switch_dark')}
			className={cn(
				'inline-flex h-9 w-9 items-center justify-center rounded-[var(--radius-ui)]',
				'border border-border bg-surface text-text',
				'transition-colors hover:bg-surface-2',
				'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring',
				className
			)}
		>
			{isDark ? <Sun size={18} aria-hidden="true" /> : <Moon size={18} aria-hidden="true" />}
		</button>
	);
}
