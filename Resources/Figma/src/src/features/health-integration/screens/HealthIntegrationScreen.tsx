import React, { useState } from 'react';
import { HeartPulseIcon, Loader2Icon, RefreshCwIcon, SmartphoneIcon, WatchIcon } from 'lucide-react';
import { useNavigation } from '../../../app/navigation/NavigationContext';
import { Screen } from '../../../shared/components/ui/Screen';
import { SegmentedControl } from '../../../shared/components/ui/SegmentedControl';
import { Button } from '../../../shared/components/ui/Button';
import { Badge } from '../../../shared/components/ui/Badge';
import { Toggle } from '../../../shared/components/ui/Toggle';
import { StatusBanner } from '../../../shared/components/ui/StatusBanner';
import { ConfirmDialog } from '../../../shared/components/ui/ConfirmDialog';
import { ListGroup, ListRow } from '../../../shared/components/ui/ListRow';
import { showToast } from '../../../shared/stores/toastStore';
import type { HealthPlatform } from '../../../shared/types/health';
import { useHealthStore } from '../store/healthStore';
import { healthConnectApps, healthMetrics } from '../constants/healthMetrics';

const groups = ['Activity', 'Heart', 'Sleep', 'Body', 'Vitals', 'Other'] as const;

export function HealthIntegrationScreen() {
  const { navigate } = useNavigation();
  const { platform, setPlatform, connection, setConnection, lastSync, permissions, setPermission, setAllPermissions, syncNow, status, watchConnected } = useHealthStore();
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);
  const name = platform === 'ios' ? 'Apple Health' : 'Health Connect';
  const connected = connection === 'connected';

  const connect = () => {
    setConnection('connecting');
    setTimeout(() => {
      setAllPermissions(true);
      setConnection('connected');
      showToast({ message: `${name} connected · first sync running` });
    }, 1400);
  };

  return (
    <Screen title="Health connections">
      <div className="px-4">
        <SegmentedControl<HealthPlatform> label="Platform preview" options={[{ value: 'ios', label: 'iPhone' }, { value: 'android', label: 'Android' }]} value={platform} onChange={setPlatform} />
      </div>

      <section className="mx-4 mt-4 rounded-[28px] border border-line bg-surface p-5" aria-label={`${name} status`}>
        <div className="flex items-center gap-3">
          <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-bad/10"><HeartPulseIcon size={24} className="text-bad" aria-hidden="true" /></span>
          <div className="flex-1">
            <p className="text-[17px] font-semibold text-ink">{name}</p>
            <p className="text-[13px] text-muted">{platform === 'ios' ? 'HealthKit on this iPhone' : 'Android’s shared health data hub'}</p>
          </div>
          {connected && <Badge tone="good">Connected</Badge>}
          {connection === 'error' && <Badge tone="bad">Error</Badge>}
        </div>

        {connected &&
        <div className="mt-4 flex items-center justify-between border-t border-line pt-3">
            <p className="text-[13px] text-muted">{status === 'loading' ? 'Syncing…' : `Last synced ${lastSync}`}</p>
            <Button size="sm" variant="secondary" icon={RefreshCwIcon} loading={status === 'loading'} onClick={syncNow}>Sync now</Button>
          </div>
        }
        {connection === 'disconnected' &&
        <>
            <p className="mt-4 text-[14px] leading-relaxed text-ink">FitOnus reads your health data to personalize recovery, sleep and coaching. You choose each data type, and can turn any off later in {platform === 'ios' ? 'iOS Settings → Health' : 'Health Connect settings'}.</p>
            <Button size="lg" fullWidth className="mt-4" onClick={connect}>Connect {name}</Button>
          </>
        }
        {connection === 'connecting' &&
        <p className="mt-4 flex items-center gap-2 text-[14px] text-muted"><Loader2Icon size={16} className="animate-spin" aria-hidden="true" /> Waiting for {platform === 'ios' ? 'the iOS permission sheet' : 'Health Connect'}…</p>
        }
        {connection === 'error' &&
        <StatusBanner className="mt-4" tone="error" title="Sync failed" body={`${name} didn’t respond. Data from ${lastSync} is still shown.`} actionLabel="Retry" onAction={() => {setConnection('connected');syncNow();}} />
        }
      </section>

      {status === 'permissions' && connected &&
      <div className="mx-4 mt-3"><StatusBanner tone="warning" title="Some permissions are off" body="Recovery needs Sleep and HRV. Without them it can’t be calculated." /></div>
      }

      {platform === 'android' && connected &&
      <section className="mt-6 px-4" aria-labelledby="apps">
          <h2 id="apps" className="mb-2 px-1 text-[17px] font-semibold text-ink">Apps sharing through Health Connect</h2>
          <ListGroup>
            {healthConnectApps.map((a) =>
          <ListRow key={a.name} icon={SmartphoneIcon} title={a.name} subtitle={a.detail} chevron={false}
          trailing={a.status === 'connected' ? <Badge tone="good">Sharing</Badge> : a.status === 'available' ? <Button size="sm" variant="secondary" onClick={() => showToast({ message: `Opens Health Connect to allow ${a.name}`, tone: 'info' })}>Allow</Button> : <Badge>Not installed</Badge>} />
          )}
          </ListGroup>
          <p className="mt-2 px-1 text-[12px] text-muted">What’s available depends on which apps you’ve installed and what they share.</p>
        </section>
      }

      {platform === 'ios' &&
      <div className="mt-6 px-4">
          <ListGroup>
            <ListRow icon={WatchIcon} title="Apple Watch" subtitle={watchConnected ? 'Series 9 · synced through Apple Health' : 'Not paired'} onClick={() => navigate('appleWatch')} />
          </ListGroup>
        </div>
      }

      {connected && groups.map((g) => {
        const list = healthMetrics.filter((m) => m.group === g);
        return (
          <section key={g} className="mt-6 px-4" aria-label={`${g} permissions`}>
            <h2 className="mb-2 px-1 text-[13px] font-medium text-muted">{g}</h2>
            <ul className="divide-y divide-line overflow-hidden rounded-3xl border border-line bg-surface">
              {list.map((m) =>
              <li key={m.key} className="flex items-center gap-3 px-4 py-3">
                  <span className="min-w-0 flex-1">
                    <span className={`block text-[15px] font-medium ${m.availability === 'unavailable' ? 'text-muted' : 'text-ink'}`}>{m.label}</span>
                    <span className="block text-[12px] text-muted">
                      {m.availability === 'available' ? m.source : m.note}
                    </span>
                  </span>
                  {m.availability === 'unavailable' ?
                <Badge>Unavailable</Badge> :

                <>
                      {m.availability === 'noData' && <Badge tone="warn">No data</Badge>}
                      <Toggle checked={permissions[m.key] ?? false} onChange={(v) => setPermission(m.key, v)} label={`Allow ${m.label}`} />
                    </>
                }
                </li>
              )}
            </ul>
          </section>);

      })}

      {connected &&
      <div className="mt-6 px-4">
          <Button fullWidth variant="danger" onClick={() => setConfirmDisconnect(true)}>Disconnect {name}</Button>
          <p className="mt-2 px-2 text-center text-[12px] text-muted">Your logged meals, workouts and weights stay in FitOnus.</p>
        </div>
      }

      <ConfirmDialog
        open={confirmDisconnect}
        title={`Disconnect ${name}?`}
        message="Recovery, sleep and heart-rate insights will stop updating. Steps will be estimated from your phone where possible."
        confirmLabel="Disconnect"
        destructive
        onCancel={() => setConfirmDisconnect(false)}
        onConfirm={() => {setConnection('disconnected');setConfirmDisconnect(false);showToast({ message: `${name} disconnected` });}} />
      
    </Screen>);

}