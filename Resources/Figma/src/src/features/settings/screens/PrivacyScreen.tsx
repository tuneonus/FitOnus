import React, { useState } from 'react';
import { DownloadIcon, EyeIcon } from 'lucide-react';
import { useNavigation } from '../../../app/navigation/NavigationContext';
import { Screen } from '../../../shared/components/ui/Screen';
import { Toggle } from '../../../shared/components/ui/Toggle';
import { Button } from '../../../shared/components/ui/Button';
import { ListGroup, ListRow } from '../../../shared/components/ui/ListRow';
import { showToast } from '../../../shared/stores/toastStore';

const aiAccess = ['Today’s health data and trends', 'Workout, meal and weight logs', 'Goals and saved AI memory', 'Sleep and recovery history'];

export function PrivacyScreen() {
  const { navigate } = useNavigation();
  const [prefs, setPrefs] = useState({ analytics: true, improve: false, photos: true });
  const [exporting, setExporting] = useState(false);
  const toggle = (k: keyof typeof prefs) => (v: boolean) => setPrefs({ ...prefs, [k]: v });

  const rows: {key: keyof typeof prefs;title: string;sub: string;}[] = [
  { key: 'photos', title: 'Keep meal photos', sub: 'Otherwise deleted right after analysis' },
  { key: 'analytics', title: 'App usage analytics', sub: 'Anonymous crash and performance data' },
  { key: 'improve', title: 'Help improve the coach', sub: 'Share de-identified chats for quality review' }];


  return (
    <Screen title="Privacy">
      <section className="mx-4 rounded-[28px] bg-hero p-5 text-heroInk" aria-labelledby="access">
        <h2 id="access" className="flex items-center gap-2 text-[15px] font-semibold"><EyeIcon size={16} className="text-accent" aria-hidden="true" /> What your coach can read</h2>
        <ul className="mt-3 space-y-1.5 text-[13.5px] text-heroMuted">
          {aiAccess.map((a) => <li key={a} className="flex gap-2"><span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-accent" />{a}</li>)}
        </ul>
        <p className="mt-3 text-[12.5px] text-heroMuted">Your health data is never sold or used for advertising. AI answers are guidance, not medical diagnoses.</p>
      </section>

      <ul className="mx-4 mt-4 divide-y divide-line overflow-hidden rounded-3xl border border-line bg-surface">
        {rows.map((r) =>
        <li key={r.key} className="flex items-center gap-3 px-4 py-3.5">
            <span className="flex-1"><span className="block text-[15px] font-medium text-ink">{r.title}</span><span className="block text-[12.5px] text-muted">{r.sub}</span></span>
            <Toggle checked={prefs[r.key]} onChange={toggle(r.key)} label={r.title} />
          </li>
        )}
      </ul>

      <div className="mt-4 px-4">
        <ListGroup>
          <ListRow title="Health permissions" subtitle="Choose which data types FitOnus can read" onClick={() => navigate('healthIntegration')} />
          <ListRow title="AI memory" subtitle="View, edit or delete what the coach remembers" onClick={() => navigate('aiMemory')} />
        </ListGroup>
        <Button fullWidth variant="outline" icon={DownloadIcon} className="mt-4" loading={exporting} onClick={() => {setExporting(true);setTimeout(() => {setExporting(false);showToast({ message: 'Export requested — we’ll email a download link' });}, 1200);}}>
          Export my data
        </Button>
      </div>
    </Screen>);

}