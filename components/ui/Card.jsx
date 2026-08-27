import { forwardRef } from 'react';
import { cn } from '@/lib/utils';

const Card = forwardRef(function Card({ className, ...props }, ref) {
	return (
		<div
			ref={ref}
			className={cn(
				'rounded-[var(--radius-ui)] border border-border bg-surface text-text',
				'shadow-sm',
				className
			)}
			{...props}
		/>
	);
});

const CardHeader = forwardRef(function CardHeader({ className, ...props }, ref) {
	return (
		<div
			ref={ref}
			className={cn('flex flex-col gap-1 border-b border-border px-4 py-3', className)}
			{...props}
		/>
	);
});

const CardTitle = forwardRef(function CardTitle({ className, ...props }, ref) {
	return (
		<h3
			ref={ref}
			className={cn('text-lg font-bold leading-tight tracking-tight', className)}
			{...props}
		/>
	);
});

const CardDescription = forwardRef(function CardDescription({ className, ...props }, ref) {
	return <p ref={ref} className={cn('text-sm text-muted', className)} {...props} />;
});

const CardContent = forwardRef(function CardContent({ className, ...props }, ref) {
	return <div ref={ref} className={cn('px-4 py-3', className)} {...props} />;
});

const CardFooter = forwardRef(function CardFooter({ className, ...props }, ref) {
	return (
		<div
			ref={ref}
			className={cn('flex items-center gap-2 border-t border-border px-4 py-3', className)}
			{...props}
		/>
	);
});

export { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter };
