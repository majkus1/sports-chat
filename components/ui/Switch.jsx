'use client';

import { forwardRef } from 'react';
import * as SwitchPrimitive from '@radix-ui/react-switch';
import { cn } from '@/lib/utils';

const Switch = forwardRef(function Switch({ className, ...props }, ref) {
	return (
		<SwitchPrimitive.Root
			ref={ref}
			className={cn(
				'peer inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full',
				'border-2 border-transparent transition-colors',
				'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring',
				'disabled:cursor-not-allowed disabled:opacity-50',
				'data-[state=checked]:bg-accent data-[state=unchecked]:bg-surface-3',
				className
			)}
			{...props}
		>
			<SwitchPrimitive.Thumb
				className={cn(
					'pointer-events-none block h-5 w-5 rounded-full bg-white shadow-sm',
					'transition-transform data-[state=checked]:translate-x-5 data-[state=unchecked]:translate-x-0'
				)}
			/>
		</SwitchPrimitive.Root>
	);
});

export { Switch };
export default Switch;
