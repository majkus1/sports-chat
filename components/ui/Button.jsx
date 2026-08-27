'use client';

import { forwardRef } from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva } from 'class-variance-authority';
import { cn } from '@/lib/utils';

/**
 * Warianty przycisku. Wcześniej każdy przycisk w aplikacji miał własny obiekt inline
 * `style={{}}` plus ręczne onMouseEnter/onMouseLeave do zmiany koloru — stąd rozjazd
 * wyglądu między ekranami i brak stanu focus dla klawiatury.
 */
const buttonVariants = cva(
	cn(
		'inline-flex items-center justify-center gap-2 whitespace-nowrap',
		'rounded-[var(--radius-ui)] font-semibold',
		'transition-colors duration-150',
		'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring',
		'disabled:pointer-events-none disabled:opacity-50'
	),
	{
		variants: {
			variant: {
				primary: 'bg-brand text-brand-fg hover:bg-brand-hover',
				accent: 'bg-accent text-accent-fg hover:bg-accent-hover',
				outline: 'border border-border-strong bg-transparent text-text hover:bg-surface-2',
				ghost: 'bg-transparent text-text hover:bg-surface-2',
				danger: 'bg-loss text-white hover:opacity-90',
				link: 'bg-transparent text-brand underline-offset-4 hover:underline',
			},
			size: {
				sm: 'h-8 px-3 text-sm',
				md: 'h-10 px-4 text-base',
				lg: 'h-12 px-6 text-lg',
				icon: 'h-10 w-10',
			},
			block: {
				true: 'w-full',
			},
		},
		defaultVariants: {
			variant: 'primary',
			size: 'md',
		},
	}
);

/** `asChild` pozwala nadać wygląd przycisku np. linkowi <Link>, bez zagnieżdżania <a><button>. */
const Button = forwardRef(function Button(
	{ className, variant, size, block, asChild = false, ...props },
	ref
) {
	const Component = asChild ? Slot : 'button';
	return (
		<Component
			ref={ref}
			className={cn(buttonVariants({ variant, size, block }), className)}
			{...props}
		/>
	);
});

export { Button, buttonVariants };
export default Button;
