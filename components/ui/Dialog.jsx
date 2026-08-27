'use client';

import { forwardRef } from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Zastępuje ręczny `components/Modal.js`, który nie miał tła nakładki, pułapki focusu
 * ani blokady przewijania tła — Radix daje to wszystko z dostępnością w standardzie.
 */
const Dialog = DialogPrimitive.Root;
const DialogTrigger = DialogPrimitive.Trigger;
const DialogClose = DialogPrimitive.Close;
const DialogPortal = DialogPrimitive.Portal;

const DialogOverlay = forwardRef(function DialogOverlay({ className, ...props }, ref) {
	return (
		<DialogPrimitive.Overlay
			ref={ref}
			className={cn(
				'fixed inset-0 z-[10050] bg-black/60 backdrop-blur-sm',
				'data-[state=open]:animate-in data-[state=closed]:animate-out',
				'data-[state=open]:fade-in-0 data-[state=closed]:fade-out-0',
				className
			)}
			{...props}
		/>
	);
});

const DialogContent = forwardRef(function DialogContent(
	{ className, children, showClose = true, ...props },
	ref
) {
	return (
		<DialogPortal>
			<DialogOverlay />
			<DialogPrimitive.Content
				ref={ref}
				className={cn(
					'fixed left-1/2 top-1/2 z-[10051] w-[calc(100vw-2rem)] max-w-lg',
					'-translate-x-1/2 -translate-y-1/2',
					'max-h-[calc(100vh-2rem)] overflow-y-auto',
					'rounded-[var(--radius-ui)] border border-border bg-surface p-5 text-text shadow-xl',
					'data-[state=open]:animate-in data-[state=closed]:animate-out',
					'data-[state=open]:fade-in-0 data-[state=closed]:fade-out-0',
					'data-[state=open]:zoom-in-95 data-[state=closed]:zoom-out-95',
					className
				)}
				{...props}
			>
				{children}
				{showClose && (
					<DialogPrimitive.Close
						className={cn(
							'absolute right-3 top-3 inline-flex h-8 w-8 items-center justify-center',
							'rounded-[var(--radius-ui)] text-muted transition-colors hover:bg-surface-2 hover:text-text',
							'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring'
						)}
					>
						<X size={18} aria-hidden="true" />
						<span className="sr-only">Zamknij</span>
					</DialogPrimitive.Close>
				)}
			</DialogPrimitive.Content>
		</DialogPortal>
	);
});

function DialogHeader({ className, ...props }) {
	return <div className={cn('mb-4 flex flex-col gap-1 pr-8', className)} {...props} />;
}

const DialogTitle = forwardRef(function DialogTitle({ className, ...props }, ref) {
	return (
		<DialogPrimitive.Title
			ref={ref}
			className={cn('text-xl font-bold leading-tight', className)}
			{...props}
		/>
	);
});

const DialogDescription = forwardRef(function DialogDescription({ className, ...props }, ref) {
	return (
		<DialogPrimitive.Description
			ref={ref}
			className={cn('text-sm text-muted', className)}
			{...props}
		/>
	);
});

export {
	Dialog,
	DialogTrigger,
	DialogClose,
	DialogPortal,
	DialogOverlay,
	DialogContent,
	DialogHeader,
	DialogTitle,
	DialogDescription,
};
