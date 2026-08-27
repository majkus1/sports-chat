'use client';

import { forwardRef } from 'react';
import { cn } from '@/lib/utils';

/**
 * Pola formularzy mają w projekcie globalne style z `styles/LoginModal.scss` (`input {}`).
 * Dlatego wszystkie właściwości ustawiamy tu jawnie — inaczej globalny selektor
 * wygrywałby specyficznością z częścią utility.
 */
const baseFieldClasses = cn(
	'w-full rounded-[var(--radius-ui)] border border-border bg-surface px-3 py-2',
	'text-base text-text placeholder:text-muted',
	'transition-colors',
	'focus:border-ring focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring',
	'disabled:cursor-not-allowed disabled:opacity-60'
);

const Input = forwardRef(function Input({ className, type = 'text', ...props }, ref) {
	return <input ref={ref} type={type} className={cn(baseFieldClasses, className)} {...props} />;
});

const Textarea = forwardRef(function Textarea({ className, ...props }, ref) {
	return (
		<textarea ref={ref} className={cn(baseFieldClasses, 'resize-none', className)} {...props} />
	);
});

export { Input, Textarea, baseFieldClasses };
export default Input;
