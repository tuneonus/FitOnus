import React from 'react';
import { BrainIcon, DumbbellIcon, HeartPulseIcon, SettingsIcon, TargetIcon, UserIcon, UtensilsIcon, WatchIcon } from 'lucide-react';
import { useNavigation } from '../../../app/navigation/NavigationContext';
import { Screen } from '../../../shared/components/ui/Screen';
import { IconButton } from '../../../shared/components/ui/IconButton';
import { ListGroup, ListRow } from '../../../shared/components/ui/ListRow';
import { Badge } from '../../../shared/components/ui/Badge';
import { useProfileSetupStore } from '../../onboarding/store/profileSetupStore';
import { useGoalsStore } from '../../goals/store/goalsStore';
import { useMemoryStore } from '../../ai-memory/store/memoryStore';
import { useHealthStore } from '../../health-integration/store/healthStore';
import { fitnessGoals } from '../../onboarding/constants/options';

export function ProfileScreen() {
  const { navigate } = useNavigation();
  const p = useProfileSetupStore();
  const activeGoals = useGoalsStore((s) => s.goals.filter((g) => g.status === 'active').length);
  const memories = useMemoryStore((s) => s.items.length);
  const { connection, platform, watchConnected } = useHealthStore();
  const goalLabel = fitnessGoals.find((g) => g.value === p.goal)?.label ?? 'Not set';
  const initials = p.name.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase();

  return (
    <Screen headerRight={<IconButton icon={SettingsIcon} label="Settings" onClick={() => navigate('settings')} />}>
      <section className="flex flex-col items-center px-5 text-center">
        <span className="flex h-20 w-20 items-center justify-center rounded-full bg-ink text-[26px] font-semibold text-bg">{initials}</span>
        <h1 className="mt-3 text-[24px] font-semibold tracking-[-0.02em] text-ink">{p.name}</h1>
        <p className="text-[14px] text-muted">Member since Sep 2026 · {goalLabel}</p>
      </section>

      <dl className="mx-4 mt-5 grid grid-cols-3 divide-x divide-line rounded-3xl border border-line bg-surface py-4 text-center">
        <div><dt className="text-[12px] text-muted">Weight</dt><dd className="font-mono text-[18px] font-semibold text-ink">{p.weightKg}<span className="text-[11px] font-normal text-muted"> kg</span></dd></div>
        <div><dt className="text-[12px] text-muted">Height</dt><dd className="font-mono text-[18px] font-semibold text-ink">{p.heightCm}<span className="text-[11px] font-normal text-muted"> cm</span></dd></div>
        <div><dt className="text-[12px] text-muted">Workouts</dt><dd className="font-mono text-[18px] font-semibold text-ink">47</dd></div>
      </dl>

      <div className="mt-6 space-y-4 px-4">
        <ListGroup>
          <ListRow icon={UserIcon} title="Personal information" subtitle="Name, birthday, height, weight" onClick={() => navigate('personalInfo')} />
          <ListRow icon={DumbbellIcon} title="Fitness & workout preferences" subtitle={`${p.daysPerWeek} days · ${p.durationMin} min · ${p.place}`} onClick={() => navigate('fitnessPreferences')} />
          <ListRow icon={UtensilsIcon} title="Nutrition preferences" subtitle={`${p.diet[0].toUpperCase()}${p.diet.slice(1)} · ${p.cuisines.join(', ') || 'Any cuisine'}`} onClick={() => navigate('nutritionPreferences')} />
          <ListRow icon={TargetIcon} title="Goals" value={`${activeGoals} active`} onClick={() => navigate('goals')} />
        </ListGroup>
        <ListGroup>
          <ListRow icon={HeartPulseIcon} title={platform === 'ios' ? 'Apple Health' : 'Health Connect'} trailing={connection === 'connected' ? <Badge tone="good">Connected</Badge> : <Badge tone="warn">Not connected</Badge>} onClick={() => navigate('healthIntegration')} />
          <ListRow icon={WatchIcon} title="Apple Watch" value={watchConnected ? 'Series 9' : 'Not paired'} onClick={() => navigate('appleWatch')} />
          <ListRow icon={BrainIcon} title="AI memory" value={`${memories} saved`} onClick={() => navigate('aiMemory')} />
        </ListGroup>
        <ListGroup>
          <ListRow icon={SettingsIcon} title="Settings" onClick={() => navigate('settings')} />
        </ListGroup>
      </div>
    </Screen>);

}