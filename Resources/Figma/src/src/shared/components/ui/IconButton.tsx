import React from "react";
import { cn } from "../../utils/cn";
import { BoxIcon } from "lucide-react";
type IconButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  icon: BoxIcon;
  label: string;
  variant?: 'ghost' | 'surface' | 'hero';
  badge?: boolean;
};
const variants = {
  ghost: 'text-ink hover:bg-ink/[0.06]',
  surface: 'border border-line bg-surface text-ink hover:bg-surface2',
  hero: 'bg-heroInk/10 text-heroInk hover:bg-heroInk/15'
};
export function IconButton({
  icon: Icon,
  label,
  variant = 'ghost',
  badge,
  className,
  type = 'button',
  ...rest
}: IconButtonProps) {
  return <button type={type} aria-label={label} className={cn('relative flex h-11 w-11 shrink-0 items-center justify-center rounded-full transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/30', variants[variant], className)} {...rest}>
      <Icon size={20} strokeWidth={1.85} aria-hidden="true" />
      {badge && <span className="absolute right-[11px] top-[10px] h-2 w-2 rounded-full bg-move ring-2 ring-surface" />}
    </button>;
}