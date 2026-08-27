'use client';

import { forwardRef } from 'react';
import * as ScrollAreaPrimitive from '@radix-ui/react-scroll-area';
import { cn } from '@/lib/utils';

/**
 * `viewportRef` jest wystawiony na zewnątrz, bo lista wiadomości musi sama sterować
 * pozycją przewijania (trzymanie się dołu, doładowywanie historii w górę).
 */
const ScrollArea = forwardRef(function ScrollArea(
	{ className, children, viewportRef, viewportClassName, onViewportScroll, ...props },
	ref
) {
	return (
		<ScrollAreaPrimitive.Root
			ref={ref}
			className={cn('relative overflow-hidden', className)}
			{...props}
		>
			<ScrollAreaPrimitive.Viewport
				ref={viewportRef}
				onScroll={onViewportScroll}
				className={cn('h-full w-full', viewportClassName)}
			>
				{children}
			</ScrollAreaPrimitive.Viewport>
			<ScrollAreaPrimitive.Scrollbar
				orientation="vertical"
				className={cn(
					'flex w-2 touch-none select-none p-0.5',
					'transition-colors duration-150 hover:bg-surface-2'
				)}
			>
				<ScrollAreaPrimitive.Thumb className="relative flex-1 rounded-full bg-border-strong" />
			</ScrollAreaPrimitive.Scrollbar>
			<ScrollAreaPrimitive.Corner />
		</ScrollAreaPrimitive.Root>
	);
});

export { ScrollArea };
export default ScrollArea;
