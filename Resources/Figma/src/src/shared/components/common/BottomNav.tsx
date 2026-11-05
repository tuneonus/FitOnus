import React from 'react';
import { ActivityIcon, CircleUserRoundIcon, HouseIcon, SparklesIcon, TrendingUpIcon } from 'lucide-react';
import { useNavigation } from '../../../app/navigation/NavigationContext';
import type { TabKey } from '../../../app/navigation/routes';

const sideTabs: {key: TabKey;label: string;icon: typeof HouseIcon;}[] = [
{ key: 'home', label: 'Home', icon: HouseIcon },
{ key: 'activity', label: 'Activity', icon: ActivityIcon },
{ key: 'progress', label: 'Progress', icon: TrendingUpIcon },
{ key: 'profile', label: 'Profile', icon: CircleUserRoundIcon }];


export function BottomNav() {
  const { activeTab, switchTab } = useNavigation();

  const renderTab = (tab: (typeof sideTabs)[number]) => {
    const isActive = tab.key === activeTab;
    const Icon = tab.icon;
    return (
      <li key={tab.key} className="flex-1">
        <button
          type="button"
          onClick={() => switchTab(tab.key)}
          aria-current={isActive ? 'page' : undefined}
          className={`flex h-14 w-full flex-col items-center justify-center gap-1 rounded-2xl transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/30 ${
          isActive ? 'text-ink' : 'text-muted hover:text-ink'}`
          }>
          
          <Icon size={22} strokeWidth={isActive ? 2.25 : 1.75} aria-hidden="true" />
          <span className={`text-[11px] ${isActive ? 'font-semibold' : 'font-medium'}`}>{tab.label}</span>
        </button>
      </li>);

  };

  return (
    <nav aria-label="Primary" className="absolute inset-x-0 bottom-0 z-30 border-t border-line bg-surface/90 pb-7 backdrop-blur-xl">
      <ul className="flex items-end px-2 pt-1.5">
        {sideTabs.slice(0, 2).map(renderTab)}
        <li className="flex flex-1 justify-center">
          <button
            type="button"
            onClick={() => switchTab('coach')}
            aria-current={activeTab === 'coach' ? 'page' : undefined}
            className="group -mt-7 flex flex-col items-center gap-1 focus-visible:outline-none">
            
            <span
              className={`flex h-[60px] w-[60px] items-center justify-center rounded-full bg-accent text-accentInk shadow-[0_8px_24px_-8px_rgb(var(--accent)/0.7)] ring-[5px] transition-transform duration-150 ease-out group-active:scale-[0.96] ${
              activeTab === 'coach' ? 'ring-ink/80' : 'ring-bg'} group-focus-visible:ring-ink/40`
              }>
              
              <SparklesIcon size={26} strokeWidth={2} aria-hidden="true" />
            </span>
            <span className="text-[11px] font-semibold text-ink">AI Coach</span>
          </button>
        </li>
        {sideTabs.slice(2).map(renderTab)}
      </ul>
      <span className="absolute bottom-2 left-1/2 h-[5px] w-[134px] -translate-x-1/2 rounded-full bg-ink" aria-hidden="true" />
    </nav>);

}