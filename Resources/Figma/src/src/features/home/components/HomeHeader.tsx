import React from 'react';
import { BellIcon } from 'lucide-react';
import { useNavigation } from '../../../app/navigation/NavigationContext';
import { IconButton } from '../../../shared/components/ui/IconButton';
import { useUnreadCount } from '../../notifications/store/notificationsStore';
import { homeUser } from '../data/homeMock';

export function HomeHeader() {
  const { navigate, switchTab } = useNavigation();
  const unread = useUnreadCount();

  return (
    <header className="flex items-center justify-between px-5 pb-4 pt-3">
      <div className="flex items-center gap-3">
        <button
          type="button"
          aria-label="Open profile"
          onClick={() => switchTab('profile')}
          className="flex h-11 w-11 items-center justify-center rounded-full bg-ink text-[14px] font-semibold text-bg transition-transform duration-150 ease-out active:scale-[0.96] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/30 focus-visible:ring-offset-2 focus-visible:ring-offset-bg">
          
          {homeUser.initials}
        </button>
        <div>
          <p className="text-[13px] text-muted">{homeUser.dateLabel}</p>
          <h1 className="text-[22px] font-semibold leading-tight tracking-[-0.02em] text-ink">
            {homeUser.greeting}, {homeUser.firstName}
          </h1>
        </div>
      </div>
      <IconButton
        icon={BellIcon}
        variant="surface"
        label={`Notifications, ${unread} unread`}
        badge={unread > 0}
        onClick={() => navigate('notifications')} />
      
    </header>);

}