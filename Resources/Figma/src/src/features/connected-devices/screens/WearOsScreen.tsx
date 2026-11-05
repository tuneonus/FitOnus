import React from 'react';
import { BellIcon, CircleDotIcon, HeartPulseIcon, TimerIcon, WatchIcon } from 'lucide-react';
import { useNavigation } from '../../../app/navigation/NavigationContext';
import { Screen } from '../../../shared/components/ui/Screen';
import { Badge } from '../../../shared/components/ui/Badge';
import { Button } from '../../../shared/components/ui/Button';
import { showToast } from '../../../shared/stores/toastStore';

const planned = [
{ icon: HeartPulseIcon, title: 'Heart rate, steps and sleep', body: 'Read through Health Connect from Pixel Watch, Galaxy Watch and other Wear OS devices.' },
{ icon: TimerIcon, title: 'Workout tiles', body: 'Start today’s plan and log sets from your wrist.' },
{ icon: BellIcon, title: 'Wrist reminders', body: 'Rest timer haptics, water and walk nudges.' }];


/** Future-support preview. Nothing here is implemented yet. */
export function WearOsScreen() {
  const { navigate } = useNavigation();
  return (
    <Screen title="Wear OS">
      <section className="mx-4 rounded-[28px] border border-dashed border-line p-5">
        <div className="flex items-center gap-3">
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-surface2"><WatchIcon size={22} className="text-ink" aria-hidden="true" /></span>
          <div className="flex-1">
            <p className="text-[17px] font-semibold text-ink">Wear OS companion</p>
            <p className="text-[13px] text-muted">Planned · not available yet</p>
          </div>
          <Badge>Future</Badge>
        </div>
        <p className="mt-4 text-[14px] leading-relaxed text-ink">Today, data from a Wear OS watch reaches FitOnus if the watch’s app (e.g. Fitbit, Samsung Health) shares it with Health Connect.</p>
        <Button variant="secondary" fullWidth className="mt-4" onClick={() => navigate('healthIntegration')}>Check Health Connect</Button>
      </section>

      <section className="mt-6 px-4" aria-labelledby="planned">
        <h2 id="planned" className="mb-2 px-1 text-[17px] font-semibold text-ink">What’s planned</h2>
        <ul className="divide-y divide-line overflow-hidden rounded-3xl border border-line bg-surface">
          {planned.map((p) =>
          <li key={p.title} className="flex gap-3 px-4 py-3.5">
              <p.icon size={18} className="mt-0.5 shrink-0 text-muted" aria-hidden="true" />
              <span><span className="block text-[15px] font-medium text-ink">{p.title}</span><span className="block text-[13px] leading-snug text-muted">{p.body}</span></span>
            </li>
          )}
        </ul>
      </section>

      <div className="mt-6 flex items-start gap-2 px-6 text-[12.5px] text-muted">
        <CircleDotIcon size={14} className="mt-0.5 shrink-0" aria-hidden="true" />
        <p>Wear OS data uses the same normalized health model as Apple Watch, so screens won’t change when support ships.</p>
      </div>
      <div className="mt-4 px-4">
        <Button fullWidth variant="outline" onClick={() => showToast({ message: 'We’ll notify you when Wear OS support launches' })}>Notify me</Button>
      </div>
    </Screen>);

}