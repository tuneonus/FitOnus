import React from "react";
import { Loader2Icon, BoxIcon } from "lucide-react";
import { cn } from "../../utils/cn";
type ButtonVariant = 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger' | 'inverse';
type ButtonSize = 'sm' | 'md' | 'lg';
type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  fullWidth?: boolean;
  icon?: BoxIcon;
  iconRight?: BoxIcon;
  loading?: boolean;
};
const variants: Record<ButtonVariant, string> = {
  primary: 'bg-accent text-accentInk',
  secondary: 'bg-surface2 text-ink hover:bg-ink/[0.09]',
  outline: 'border border-line bg-surface text-ink hover:bg-surface2',
  ghost: 'text-ink hover:bg-ink/[0.06]',
  danger: 'bg-bad/10 text-bad hover:bg-bad/15',
  inverse: 'bg-ink text-bg'
};
const sizes: Record<ButtonSize, string> = {
  sm: 'h-9 px-3.5 text-[13px] gap-1.5',
  md: 'h-11 px-5 text-[15px] gap-2',
  lg: 'h-[52px] px-6 text-[16px] gap-2'
};
export function Button({
  variant = 'primary',
  size = 'md',
  fullWidth,
  icon: Icon,
  iconRight: IconRight,
  loading,
  className,
  children,
  disabled,
  type = 'button',
  ...rest
}: ButtonProps) {
  const iconSize = size === 'sm' ? 15 : 18;
  return <button type={type} disabled={disabled || loading} className={cn('inline-flex shrink-0 items-center justify-center whitespace-nowrap rounded-full font-semibold transition-[transform,background-color,opacity] duration-150 ease-out active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/40 focus-visible:ring-offset-2 focus-visible:ring-offset-bg disabled:opacity-40 disabled:active:scale-100', variants[variant], sizes[size], fullWidth && 'w-full', className)} {...rest}>
      {loading ? <Loader2Icon size={iconSize} className="animate-spin" aria-hidden="true" /> : Icon && <Icon size={iconSize} aria-hidden="true" />}
      {children}
      {IconRight && !loading && <IconRight size={iconSize} aria-hidden="true" />}
    </button>;
}