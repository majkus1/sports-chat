'use client';

import { forwardRef } from 'react';
import * as AvatarPrimitive from '@radix-ui/react-avatar';
import { cn } from '@/lib/utils';

const Avatar = forwardRef(function Avatar({ className, ...props }, ref) {
	return (
		<AvatarPrimitive.Root
			ref={ref}
			className={cn(
				'relative flex h-9 w-9 shrink-0 overflow-hidden rounded-full bg-surface-2',
				className
			)}
			{...props}
		/>
	);
});

const AvatarImage = forwardRef(function AvatarImage({ className, ...props }, ref) {
	return (
		<AvatarPrimitive.Image
			ref={ref}
			className={cn('h-full w-full object-cover', className)}
			{...props}
		/>
	);
});

const AvatarFallback = forwardRef(function AvatarFallback({ className, ...props }, ref) {
	return (
		<AvatarPrimitive.Fallback
			ref={ref}
			className={cn(
				'flex h-full w-full items-center justify-center',
				'text-sm font-bold uppercase text-muted',
				className
			)}
			{...props}
		/>
	);
});

/**
 * Inicjały jako awatar zastępczy — użytkownicy czatu w większości nie mają zdjęcia,
 * a sama pierwsza litera nicku wystarczy, by odróżnić rozmówców na liście wiadomości.
 */
export function initialsFromName(name) {
	const trimmed = String(name || '').trim();
	if (!trimmed) return '?';
	const parts = trimmed.split(/[\s_-]+/).filter(Boolean);
	if (parts.length === 1) return parts[0].slice(0, 2);
	return `${parts[0][0]}${parts[1][0]}`;
}

export { Avatar, AvatarImage, AvatarFallback };
