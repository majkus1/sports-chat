import { cva } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const badgeVariants = cva(
	'inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold leading-5',
	{
		variants: {
			variant: {
				neutral: 'bg-surface-2 text-muted',
				brand: 'bg-brand text-brand-fg',
				accent: 'bg-accent text-accent-fg',
				outline: 'border border-border-strong text-text',
				/** Mecz na żywo — pulsująca kropka dodawana przez `dot` */
				live: 'bg-live text-white',
				win: 'bg-win text-white',
				draw: 'bg-draw text-white',
				loss: 'bg-loss text-white',
			},
		},
		defaultVariants: { variant: 'neutral' },
	}
);

export function Badge({ className, variant, dot = false, children, ...props }) {
	return (
		<span className={cn(badgeVariants({ variant }), className)} {...props}>
			{dot && (
				<span
					aria-hidden="true"
					className="h-1.5 w-1.5 rounded-full bg-current motion-safe:animate-pulse"
				/>
			)}
			{children}
		</span>
	);
}

export { badgeVariants };
export default Badge;
