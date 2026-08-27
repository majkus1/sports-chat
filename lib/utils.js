import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * Łączy klasy i rozstrzyga konflikty Tailwinda (ostatnia wygrywa).
 * Bez tego `cn('px-2', props.className)` z `px-6` w propsie dałoby obie klasy naraz.
 */
export function cn(...inputs) {
	return twMerge(clsx(inputs));
}
