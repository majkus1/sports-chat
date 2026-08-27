'use client';

import { useId, useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Pole formularza logowania i rejestracji.
 *
 * Etykiety stoją nad polami, a nie obok: przy etykietach z boku szerokość pola zależała
 * od długości słowa, więc „Login" i „Hasło" nie kończyły się w jednej linii, a na wąskim
 * ekranie brakowało miejsca na tekst.
 *
 * `autoComplete` jest wymagane, nie ozdobne — bez niego menedżery haseł nie wiedzą,
 * co podpowiedzieć ani co zapisać po rejestracji.
 */
export default function AuthField({
	label,
	type = 'text',
	value,
	onChange,
	autoComplete,
	required = false,
	revealLabel,
	hideLabel,
	className,
	...props
}) {
	const id = useId();
	const [isRevealed, setIsRevealed] = useState(false);

	const isPassword = type === 'password';
	const inputType = isPassword && isRevealed ? 'text' : type;

	return (
		<div className={cn('flex flex-col gap-1.5', className)}>
			<label htmlFor={id} className="text-xs font-semibold uppercase tracking-wide text-muted">
				{label}
			</label>

			<div className="relative">
				<input
					id={id}
					type={inputType}
					value={value}
					onChange={onChange}
					required={required}
					autoComplete={autoComplete}
					className={cn(
						'w-full rounded-[var(--radius-ui)] border border-border bg-surface',
						'px-3 py-2.5 text-[15px] text-text',
						'transition-colors placeholder:text-muted',
						'focus:border-accent focus:outline-2 focus:outline-offset-2 focus:outline-ring',
						isPassword && 'pr-11'
					)}
					{...props}
				/>

				{isPassword && (
					<button
						type="button"
						onClick={() => setIsRevealed((v) => !v)}
						aria-label={isRevealed ? hideLabel : revealLabel}
						// `tabIndex={-1}` celowo: przechodząc tabulatorem z hasła chcemy trafić
						// na przycisk wysyłki, a nie na podgląd znaków.
						tabIndex={-1}
						className={cn(
							'absolute right-1 top-1/2 -translate-y-1/2',
							'inline-flex h-9 w-9 items-center justify-center rounded-[var(--radius-ui)]',
							'text-muted transition-colors hover:text-text'
						)}
					>
						{isRevealed ? <EyeOff size={17} /> : <Eye size={17} />}
					</button>
				)}
			</div>
		</div>
	);
}
