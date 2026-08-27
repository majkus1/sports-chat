import { cn } from '@/lib/utils';

/** Placeholder ładowania — zastępuje spinner tam, gdzie znamy docelowy kształt treści. */
export function Skeleton({ className, ...props }) {
	return (
		<div
			aria-hidden="true"
			className={cn(
				'motion-safe:animate-pulse rounded-[calc(var(--radius-ui)-2px)] bg-surface-2',
				className
			)}
			{...props}
		/>
	);
}

export default Skeleton;
