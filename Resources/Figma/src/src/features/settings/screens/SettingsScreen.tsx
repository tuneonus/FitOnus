import React, { useState } from 'react';
import { BellIcon, BrainIcon, CircleUserRoundIcon, HeartPulseIcon, LogOutIcon, PaletteIcon, RulerIcon, ShieldIcon, WatchIcon } from 'lucide-react';
import { useNavigation } from '../../../app/navigation/NavigationContext';
import { Screen } from '../../../shared/components/ui/Screen';
import { ListGroup, ListRow } from '../../../shared/components/ui/ListRow';
import { SegmentedControl } from '../../../shared/components/ui/SegmentedControl';
import { ConfirmDialog } from '../../../shared/components/ui/ConfirmDialog';
import { Units, useSettingsStore } from '../../../shared/stores/settingsStore';

export function SettingsScreen() {
  const { navigate, reset } = useNavigation();
  const { theme, units, setUnits } = useSettingsStore();
  const [confirmLogout, setConfirmLogout] = useState(false);

  return (
    <Screen title="Settings">
      <div className="space-y-5 px-4">
        <section aria-labelledby="general">
          <h2 id="general" className="mb-2 px-1 text-[13px] font-medium text-muted">General</h2>
          <ListGroup>
            <ListRow icon={PaletteIcon} title="Appearance" value={theme[0].toUpperCase() + theme.slice(1)} onClick={() => navigate('appearance')} />
            <ListRow icon={BellIcon} title="Notifications" onClick={() => navigate('notificationPreferences')} />
            <div className="flex items-center gap-3 px-4 py-3">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-surface2"><RulerIcon size={18} className="text-ink" aria-hidden="true" /></span>
              <span className="flex-1 text-[15px] font-medium text-ink">Units</span>
              <SegmentedControl<Units> label="Units" className="w-40" options={[{ value: 'metric', label: 'kg · cm' }, { value: 'imperial', label: 'lb · in' }]} value={units} onChange={setUnits} />
            </div>
          </ListGroup>
        </section>

        <section aria-labelledby="health">
          <h2 id="health" className="mb-2 px-1 text-[13px] font-medium text-muted">Health & data</h2>
          <ListGroup>
            <ListRow icon={HeartPulseIcon} title="Health permissions" subtitle="Apple Health / Health Connect" onClick={() => navigate('healthIntegration')} />
            <ListRow icon={WatchIcon} title="Connected devices" onClick={() => navigate('appleWatch')} />
            <ListRow icon={BrainIcon} title="AI memory controls" onClick={() => navigate('aiMemory')} />
            <ListRow icon={ShieldIcon} title="Privacy" onClick={() => navigate('privacy')} />
          </ListGroup>
        </section>

        <section aria-labelledby="acct">
          <h2 id="acct" className="mb-2 px-1 text-[13px] font-medium text-muted">Account</h2>
          <ListGroup>
            <ListRow icon={CircleUserRoundIcon} title="Account settings" subtitle="aarav.mehta@gmail.com" onClick={() => navigate('account')} />
            <ListRow icon={LogOutIcon} title="Log out" destructive chevron={false} onClick={() => setConfirmLogout(true)} />
          </ListGroup>
        </section>
        <p className="text-center text-[12px] text-muted">FitOnus 1.0 (prototype) · by TuneOnus</p>
      </div>

      <ConfirmDialog
        open={confirmLogout}
        title="Log out of FitOnus?"
        message="Your data stays in your account. You’ll need to log in again to see it on this device."
        confirmLabel="Log out"
        destructive
        onCancel={() => setConfirmLogout(false)}
        onConfirm={() => {setConfirmLogout(false);reset('welcome');}} />
      
    </Screen>);

}