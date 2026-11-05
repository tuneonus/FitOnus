import React from 'react';
import { ChevronRightIcon, HeartPulseIcon, MoonIcon, ScaleIcon } from 'lucide-react';
import { useNavigation } from '../../../app/navigation/NavigationContext';
import type { RouteName } from '../../../app/navigation/routes';
import { Sparkline } from '../../../shared/components/charts/Sparkline';
import { SectionHeader } from '../../../shared/components/ui/SectionHeader';
import { SourceTag } from '../../../shared/components/ui/SourceTag';
import { useHasDeviceData } from '../../health-integration/store/healthStore';
import { useWeightStore } from '../../weight-tracking/store/weightStore';
import { BodySignal, bodySignals } from '../data/homeMock';

const config: Record<BodySignal['key'], {icon: typeof MoonIcon;className: string;route: RouteName;}> = {
  sleep: { icon: MoonIcon, className: 'text-sleep', route: 'sleep' },
  heart: { icon: HeartPulseIcon, className: 'text-move', route: 'recovery' },
  weight: { icon: ScaleIcon, className: 'text-ink', route: 'weight' }
};

export function BodySignals() {
  const { navigate } = useNavigation();
  const hasDevice = useHasDeviceData();
  const weights = useWeightStore((s) => s.entries);
  const latest = weights[weights.length - 1];
  const monthAgo = weights[Math.max(0, weights.length - 22)];
  const weightSignal: BodySignal = {
    key: 'weight',
    label: 'Weight',
    value: latest.value.toFixed(1),
    unit: 'kg',
    meta: `${(latest.value - monthAgo.value).toFixed(1)} kg in 3 weeks`,
    source: { kind: 'manual', label: `Logged ${latest.time ?? 'today'}` },
    requiresDevice: false,
    series: weights.slice(-9).map((w) => w.value)
  };

  return (
    <section aria-labelledby="signals-title" className="px-4">
      <SectionHeader id="signals-title" title="Body signals" />
      <ul className="divide-y divide-line overflow-hidden rounded-3xl border border-line bg-surface">
        {[...bodySignals, weightSignal].map((signal) => {
          const available = hasDevice || !signal.requiresDevice;
          const { icon: Icon, className, route } = config[signal.key];
          return (
            <li key={signal.key}>
              <button
                type="button"
                onClick={() => navigate(available ? route : 'healthIntegration')}
                className="flex w-full items-center gap-3 px-4 py-4 text-left transition-colors duration-150 hover:bg-surface2/60 focus-visible:bg-surface2 focus-visible:outline-none">
                
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-surface2">
                  <Icon size={19} className={className} aria-hidden="true" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[12px] text-muted">{signal.label}</span>
                  {available ?
                  <>
                      <span className="block text-ink">
                        <span className="font-mono text-[18px] font-semibold tracking-[-0.02em]">{signal.value}</span>
                        {signal.unit && <span className="ml-1 text-[12px] text-muted">{signal.unit}</span>}
                      </span>
                      <span className="mt-0.5 block text-[12px] text-muted">{signal.meta}</span>
                      <span className="mt-1 block">
                        <SourceTag source={signal.source} />
                      </span>
                    </> :

                  <>
                      <span className="block text-[15px] font-medium text-ink">No data yet</span>
                      <span className="mt-0.5 block text-[12px] text-muted">Needs Apple Health or a wearable</span>
                    </>
                  }
                </span>
                {available ?
                <span className="shrink-0">
                    {signal.series &&
                  <Sparkline
                    points={signal.series}
                    strokeClassName={signal.key === 'heart' ? 'stroke-move' : 'stroke-ink'}
                    dotClassName={signal.key === 'heart' ? 'fill-move' : 'fill-ink'} />

                  }
                    {signal.stages &&
                  <span className="block w-[76px]" aria-hidden="true">
                        <span className="flex h-2 gap-[2px] overflow-hidden rounded-full">
                          {signal.stages.map((stage) =>
                      <span key={stage.label} className={stage.className} style={{ width: `${stage.share}%` }} />
                      )}
                        </span>
                        <span className="mt-1.5 flex justify-between text-[10px] text-muted">
                          <span>Deep</span>
                          <span>Light</span>
                        </span>
                      </span>
                  }
                  </span> :

                <span className="shrink-0 text-[13px] font-semibold text-ink">Connect</span>
                }
                <ChevronRightIcon size={16} className="shrink-0 text-muted" aria-hidden="true" />
              </button>
            </li>);

        })}
      </ul>
    </section>);

}