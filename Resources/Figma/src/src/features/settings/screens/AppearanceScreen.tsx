import React from 'react';
import { MonitorSmartphoneIcon, MoonIcon, SunIcon } from 'lucide-react';
import { Screen } from '../../../shared/components/ui/Screen';
import { OptionCard } from '../../../shared/components/ui/OptionCard';
import { ThemePreference, useSettingsStore } from '../../../shared/stores/settingsStore';

const options: {value: ThemePreference;title: string;description: string;icon: typeof SunIcon;}[] = [
{ value: 'light', title: 'Light', description: 'Warm paper background, ink text', icon: SunIcon },
{ value: 'dark', title: 'Dark', description: 'Deep ink background, easier at night', icon: MoonIcon },
{ value: 'system', title: 'Match system', description: 'Follow your phone’s setting', icon: MonitorSmartphoneIcon }];


export function AppearanceScreen() {
  const { theme, setTheme } = useSettingsStore();
  return (
    <Screen title="Appearance">
      <div className="space-y-2 px-4" role="radiogroup" aria-label="Theme">
        {options.map((o) =>
        <OptionCard key={o.value} title={o.title} description={o.description} icon={o.icon} selected={theme === o.value} onSelect={() => setTheme(o.value)} />
        )}
      </div>
      <p className="mx-6 mt-4 text-[12.5px] text-muted">Changes apply immediately. Chart colors are tuned for contrast in both themes.</p>
    </Screen>);

}