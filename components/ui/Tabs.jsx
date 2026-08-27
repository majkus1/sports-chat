'use client';

import { forwardRef } from 'react';
import * as TabsPrimitive from '@radix-ui/react-tabs';
import { cn } from '@/lib/utils';

const Tabs = TabsPrimitive.Root;

const TabsList = forwardRef(function TabsList({ className, ...props }, ref) {
	return (
		<TabsPrimitive.List
			ref={ref}
			className={cn(
				'inline-flex items-center gap-0.5 rounded-full border border-border bg-surface-2 p-1',
				// Panel meczu ma dużo zakładek — na wąskim ekranie przewijamy je poziomo
				// zamiast zawijać w drugą linię. Pasek chowamy, bo tor i tak jest zaokrąglony.
				'max-w-full overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden',
				className
			)}
			{...props}
		/>
	);
});

const TabsTrigger = forwardRef(function TabsTrigger({ className, ...props }, ref) {
	return (
		<TabsPrimitive.Trigger
			ref={ref}
			className={cn(
				'inline-flex items-center gap-2 whitespace-nowrap rounded-full',
				// Bez preflightu Tailwinda `<button>` dziedziczy z przeglądarki tło `buttonface`
				// (szary #6b6b6b w trybie ciemnym) i własną ramkę — trzeba je zdjąć jawnie.
				'border-0 bg-transparent',
				'px-3.5 py-1.5 text-[13px] font-semibold text-muted',
				'transition-colors duration-150 hover:bg-surface-3 hover:text-text',
				'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring',
				// Marka jako kolor zaznaczenia — zieleń zostaje zarezerwowana dla akcji,
				// żeby aktywna zakładka nie wyglądała jak przycisk do kliknięcia.
				'data-[state=active]:bg-brand data-[state=active]:text-brand-fg',
				'data-[state=active]:shadow-sm data-[state=active]:hover:bg-brand-hover',
				className
			)}
			{...props}
		/>
	);
});

const TabsContent = forwardRef(function TabsContent({ className, ...props }, ref) {
	return (
		<TabsPrimitive.Content
			ref={ref}
			className={cn(
				'mt-5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring',
				className
			)}
			{...props}
		/>
	);
});

export { Tabs, TabsList, TabsTrigger, TabsContent };
