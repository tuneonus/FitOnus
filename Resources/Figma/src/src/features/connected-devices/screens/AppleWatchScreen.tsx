import React from 'react';
import { CheckCircle2Icon, DumbbellIcon, FlameIcon, FootprintsIcon, HeartIcon, RefreshCwIcon, TimerIcon, WatchIcon } from 'lucide-react';
import { useNavigation } from '../../../app/navigation/NavigationContext';
import { Screen } from '../../../shared/components/ui/Screen';
import { Button } from '../../../shared/components/ui/Button';
import { Badge } from '../../../shared/components/ui/Badge';
import { EmptyState } from '../../../shared/components/ui/EmptyState';
import { StatusBanner } from '../../../shared/components/ui/StatusBanner';
import { showToast } from '../../../shared/stores/toastStore';
import { useHealthStore } from '../../health-integration/store/healthStore';

const synced = [
{ icon: HeartIcon, label: 'Heart rate', value: '52 bpm resting' },
{ icon: DumbbellIcon, label: 'Workouts', value: '3 this week' },
{ icon: FootprintsIcon, label: 'Steps', value: '2,180 today' },
{ icon: FlameIcon, label: 'Active calories', value: '148 kcal' },
{ icon: TimerIcon, label: 'Exercise minutes', value: '12 min' }];


const watchWorkouts = [
{ title: 'Outdoor run · 5.2 km', when: 'Thu 6:12 AM', status: 'synced' as const },
{ title: 'Traditional strength · 54 min', when: 'Wed 6:30 AM', status: 'synced' as const },
{ title: 'Outdoor walk · 2.1 km', when: 'Today 8:40 AM', status: 'pending' as const }];


export function AppleWatchScreen() {
  const { navigate } = useNavigation();
  const { watchConnected, setWatchConnected, lastSync, syncNow, status, connection } = useHealthStore();

  if (!watchConnected) {
    return (
      <Screen title="Apple Watch">
        <EmptyState icon={WatchIcon} title="No Apple Watch found" body="Pair your watch in the iPhone Watch app. FitOnus reads its data through Apple Health — no separate app needed yet." actionLabel="I’ve paired it" onAction={() => {setWatchConnected(true);showToast({ message: 'Apple Watch found' });}} />
      </Screen>);

  }

  return (
    <Screen title="Apple Watch">
      <section className="mx-4 flex items-center gap-4 rounded-[28px] bg-hero p-5 text-heroInk">
        <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-heroInk/10"><WatchIcon size={28} className="text-accent" aria-hidden="true" /></span>
        <div className="flex-1">
          <p className="text-[17px] font-semibold">Aarav’s Apple Watch</p>
          <p className="text-[13px] text-heroMuted">Series 9 · via Apple Health</p>
          <p className="mt-1 text-[12.5px] text-heroMuted">{status === 'loading' ? 'Syncing…' : `Last synced ${lastSync}`}</p>
        </div>
        <Button size="sm" variant="inverse" icon={RefreshCwIcon} loading={status === 'loading'} onClick={syncNow} aria-label="Sync now">Sync</Button>
      </section>

      {connection !== 'connected' &&
      <div className="mx-4 mt-3"><StatusBanner tone="warning" title="Apple Health is disconnected" body="Watch data reaches FitOnus through Apple Health." actionLabel="Fix" onAction={() => navigate('healthIntegration')} /></div>
      }

      <section className="mt-6 px-4" aria-labelledby="synced">
        <h2 id="synced" className="mb-2 px-1 text-[17px] font-semibold text-ink">Synced from your watch</h2>
        <ul className="divide-y divide-line overflow-hidden rounded-3xl border border-line bg-surface">
          {synced.map((s) =>
          <li key={s.label} className="flex items-center gap-3 px-4 py-3">
              <s.icon size={17} className="text-ink" aria-hidden="true" />
              <span className="flex-1 text-[15px] text-ink">{s.label}</span>
              <span className="font-mono text-[13px] text-muted">{s.value}</span>
            </li>
          )}
        </ul>
      </section>

      <section className="mt-6 px-4" aria-labelledby="ww">
        <h2 id="ww" className="mb-2 px-1 text-[17px] font-semibold text-ink">Watch-started workouts</h2>
        <ul className="divide-y divide-line overflow-hidden rounded-3xl border border-line bg-surface">
          {watchWorkouts.map((w) =>
          <li key={w.title} className="flex items-center gap-3 px-4 py-3.5">
              <span className="min-w-0 flex-1">
                <span className="block text-[15px] font-medium text-ink">{w.title}</span>
                <span className="block text-[12px] text-muted">{w.when}</span>
              </span>
              {w.status === 'synced' ? <Badge tone="good"><CheckCircle2Icon size={12} aria-hidden="true" /> In history</Badge> : <Button size="sm" variant="secondary" onClick={() => {syncNow();showToast({ message: 'Walk added to workout history' });}}>Import</Button>}
            </li>
          )}
        </ul>
        <p className="mt-2 px-1 text-[12px] text-muted">Workouts recorded on the watch become workout records here, with heart rate attached.</p>
      </section>

      <section className="mx-4 mt-6 rounded-3xl border border-dashed border-line p-5" aria-label="Coming later">
        <div className="flex items-center gap-2"><p className="text-[15px] font-semibold text-ink">Coming later</p><Badge>Future</Badge></div>
        <ul className="mt-2 space-y-1.5 text-[13.5px] text-muted">
          <li>FitOnus watch app with live set logging</li>
          <li>Wear OS companion via Health Connect</li>
          <li>Live Activities and Dynamic Island during workouts</li>
        </ul>
        <Button size="sm" variant="secondary" className="mt-3" onClick={() => navigate('wearOs')}>Wear OS plans</Button>
      </section>

      <div className="mt-6 px-4">
        <Button fullWidth variant="ghost" onClick={() => {setWatchConnected(false);showToast({ message: 'Apple Watch removed from FitOnus' });}}>Stop using this watch</Button>
      </div>
    </Screen>);

}