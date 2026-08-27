'use client';

import { forwardRef } from 'react';
import * as TooltipPrimitive from '@radix-ui/react-tooltip';
import { cn } from '@/lib/utils';

/** Provider trzyma wspólne opóźnienie — montowany raz, w AppShell. */
const TooltipProvider = TooltipPrimitive.Provider;
const Tooltip = TooltipPrimitive.Root;
const TooltipTrigger = TooltipPrimitive.Trigger;

const TooltipContent = forwardRef(function TooltipContent(
	{ className, sideOffset = 6, ...props },
	ref
) {
	return (
		<TooltipPrimitive.Portal>
			<TooltipPrimitive.Content
				ref={ref}
				sideOffset={sideOffset}
				className={cn(
					'z-[10060] rounded-[calc(var(--radius-ui)-2px)] border border-border',
					'bg-surface-3 px-2.5 py-1.5 text-xs font-medium text-text shadow-md',
					'data-[state=delayed-open]:animate-in data-[state=delayed-open]:fade-in-0',
					className
				)}
				{...props}
			/>
		</TooltipPrimitive.Portal>
	);
});

export { TooltipProvider, Tooltip, TooltipTrigger, TooltipContent };
