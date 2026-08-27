'use client';

import { forwardRef } from 'react';
import * as DropdownMenuPrimitive from '@radix-ui/react-dropdown-menu';
import { cn } from '@/lib/utils';

const DropdownMenu = DropdownMenuPrimitive.Root;
const DropdownMenuTrigger = DropdownMenuPrimitive.Trigger;
const DropdownMenuGroup = DropdownMenuPrimitive.Group;

const DropdownMenuContent = forwardRef(function DropdownMenuContent(
	{ className, sideOffset = 6, ...props },
	ref
) {
	return (
		<DropdownMenuPrimitive.Portal>
			<DropdownMenuPrimitive.Content
				ref={ref}
				sideOffset={sideOffset}
				className={cn(
					'z-[10050] min-w-44 overflow-hidden rounded-[var(--radius-ui)]',
					'border border-border bg-surface p-1 text-text shadow-lg',
					'data-[state=open]:animate-in data-[state=closed]:animate-out',
					'data-[state=open]:fade-in-0 data-[state=closed]:fade-out-0',
					className
				)}
				{...props}
			/>
		</DropdownMenuPrimitive.Portal>
	);
});

const DropdownMenuItem = forwardRef(function DropdownMenuItem({ className, ...props }, ref) {
	return (
		<DropdownMenuPrimitive.Item
			ref={ref}
			className={cn(
				'flex cursor-pointer select-none items-center gap-2 rounded-[calc(var(--radius-ui)-3px)]',
				'px-2.5 py-2 text-sm outline-none',
				'focus:bg-surface-2 data-[disabled]:pointer-events-none data-[disabled]:opacity-50',
				className
			)}
			{...props}
		/>
	);
});

const DropdownMenuLabel = forwardRef(function DropdownMenuLabel({ className, ...props }, ref) {
	return (
		<DropdownMenuPrimitive.Label
			ref={ref}
			className={cn('px-2.5 py-1.5 text-xs font-semibold uppercase text-muted', className)}
			{...props}
		/>
	);
});

const DropdownMenuSeparator = forwardRef(function DropdownMenuSeparator(
	{ className, ...props },
	ref
) {
	return (
		<DropdownMenuPrimitive.Separator
			ref={ref}
			className={cn('-mx-1 my-1 h-px bg-border', className)}
			{...props}
		/>
	);
});

export {
	DropdownMenu,
	DropdownMenuTrigger,
	DropdownMenuGroup,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
};
