import React from 'react';
import { ChevronLeftIcon } from 'lucide-react';
import { useNavigation } from '../../../app/navigation/NavigationContext';
import { cn } from '../../utils/cn';

type ScreenProps = {
  title?: string;
  largeTitle?: string;
  subtitle?: string;
  showBack?: boolean;
  onBack?: () => void;
  headerLeft?: React.ReactNode;
  headerRight?: React.ReactNode;
  footer?: React.ReactNode;
  children: React.ReactNode;
  contentClassName?: string;
  tone?: 'default' | 'hero';
};

/** Standard screen scaffold: safe-area header, scroll body, optional sticky footer. */
export function Screen({
  title,
  largeTitle,
  subtitle,
  showBack,
  onBack,
  headerLeft,
  headerRight,
  footer,
  children,
  contentClassName,
  tone = 'default'
}: ScreenProps) {
  const { canGoBack, goBack, isTabRoot } = useNavigation();
  const backVisible = showBack ?? (canGoBack && !isTabRoot);
  const hasBar = Boolean(title || backVisible || headerLeft || headerRight);
  const isHero = tone === 'hero';

  return (
    <div className={cn('flex h-full flex-col', isHero ? 'bg-hero text-heroInk' : 'bg-bg text-ink')}>
      <header className="shrink-0 pt-12">
        {hasBar &&
        <div className="flex h-12 items-center gap-1 px-2">
            <div className="flex min-w-[44px] items-center">
              {backVisible ?
            <button
              type="button"
              onClick={onBack ?? goBack}
              aria-label="Go back"
              className={cn(
                'flex h-11 w-11 items-center justify-center rounded-full transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/30',
                isHero ? 'hover:bg-heroInk/10' : 'hover:bg-ink/[0.06]'
              )}>
              
                  <ChevronLeftIcon size={24} aria-hidden="true" />
                </button> :

            headerLeft
            }
            </div>
            <p className="min-w-0 flex-1 truncate text-center text-[16px] font-semibold">{title}</p>
            <div className="flex min-w-[44px] items-center justify-end gap-1">{headerRight}</div>
          </div>
        }
        {largeTitle &&
        <div className="px-5 pb-3 pt-1">
            <h1 className="text-[28px] font-semibold leading-tight tracking-[-0.02em]">{largeTitle}</h1>
            {subtitle &&
          <p className={cn('mt-1 text-[14px]', isHero ? 'text-heroMuted' : 'text-muted')}>
                {subtitle}
              </p>
          }
          </div>
        }
      </header>
      <div
        className={cn(
          'no-scrollbar flex-1 overflow-y-auto',
          footer ? 'pb-6' : isTabRoot ? 'pb-36' : 'pb-10',
          contentClassName
        )}>
        
        {children}
      </div>
      {footer &&
      <div
        className={cn(
          'shrink-0 border-t px-4 pt-3',
          isHero ? 'border-heroInk/10 bg-hero' : 'border-line bg-bg',
          isTabRoot ? 'pb-28' : 'pb-8'
        )}>
        
          {footer}
        </div>
      }
    </div>);

}