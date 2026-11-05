import React, { useState } from 'react';
import { useNavigation, useRouteParams } from '../../../app/navigation/NavigationContext';
import { Screen } from '../../../shared/components/ui/Screen';
import { Button } from '../../../shared/components/ui/Button';
import { Stepper } from '../../../shared/components/ui/Stepper';
import { Chip } from '../../../shared/components/ui/Chip';
import { TextField } from '../../../shared/components/ui/TextField';
import { showToast } from '../../../shared/stores/toastStore';
import { cn } from '../../../shared/utils/cn';
import { useGoalsStore } from '../store/goalsStore';
import { goalTypeMeta } from '../constants/goalTypes';
import type { GoalType } from '../types/goal';

const deadlines = ['4 weeks', '8 weeks', '12 weeks', 'Ongoing'];
const baseline: Partial<Record<GoalType, number>> = { weightLoss: 78.4, maintain: 78.4, muscleGain: 35.2, run5k: 28.7, run10k: 62, marathon: 5 };

/** Create a goal, or edit one when an `id` param is passed. */
export function GoalCreateScreen() {
  const { id } = useRouteParams();
  const { goBack, replace } = useNavigation();
  const { goals, addGoal, updateGoal } = useGoalsStore();
  const editing = goals.find((g) => g.id === id);

  const [type, setType] = useState<GoalType>(editing?.type ?? 'weightLoss');
  const meta = goalTypeMeta[type];
  const [target, setTarget] = useState(editing?.target ?? meta.defaultTarget);
  const [deadline, setDeadline] = useState(editing ? 'Ongoing' : '12 weeks');
  const [title, setTitle] = useState(editing?.title ?? '');

  const pick = (t: GoalType) => {
    setType(t);
    setTarget(goalTypeMeta[t].defaultTarget);
  };

  const autoTitle = `${meta.label} · ${target.toFixed(meta.decimals)} ${meta.unit}`;

  const save = () => {
    if (editing) {
      updateGoal(editing.id, { target, title: title || editing.title });
      showToast({ message: 'Goal updated' });
      goBack();
      return;
    }
    const start = baseline[type] ?? 0;
    const newId = addGoal({
      type,
      title: title || autoTitle,
      unit: meta.unit,
      start,
      current: meta.cadence === 'once' ? start : 0,
      target,
      deadline: deadline === 'Ongoing' ? 'Ongoing' : `In ${deadline}`,
      status: 'active',
      cadence: meta.cadence,
      history: meta.cadence === 'once' ? [start] : [0],
      hitDays: meta.cadence === 'daily' ? 0 : undefined
    });
    showToast({ message: 'Goal created. Your coach will plan around it.' });
    replace('goalDetail', { id: newId });
  };

  return (
    <Screen title={editing ? 'Edit goal' : 'New goal'} footer={<Button size="lg" fullWidth onClick={save}>{editing ? 'Save changes' : 'Create goal'}</Button>}>
      {!editing &&
      <section className="px-4" aria-labelledby="type-label">
          <h2 id="type-label" className="px-1 text-[13px] font-medium text-muted">What are you working toward?</h2>
          <div className="mt-2 grid grid-cols-2 gap-2" role="radiogroup">
            {(Object.keys(goalTypeMeta) as GoalType[]).map((t) => {
            const m = goalTypeMeta[t];
            const Icon = m.icon;
            const on = t === type;
            return (
              <button key={t} type="button" role="radio" aria-checked={on} onClick={() => pick(t)} className={cn('flex items-center gap-2.5 rounded-2xl border p-3 text-left transition-colors duration-150', on ? 'border-ink bg-surface' : 'border-line bg-surface')}>
                  <span className={cn('flex h-8 w-8 shrink-0 items-center justify-center rounded-lg', on ? 'bg-accent text-accentInk' : 'bg-surface2 text-ink')}><Icon size={16} aria-hidden="true" /></span>
                  <span className="text-[14px] font-medium text-ink">{m.label}</span>
                </button>);

          })}
          </div>
        </section>
      }

      <section className="mx-4 mt-6 rounded-3xl border border-line bg-surface p-5" aria-label="Target">
        <p className="text-[13px] text-muted">{meta.cadence === 'daily' ? 'Daily target' : meta.cadence === 'streak' ? 'Streak length' : 'Target'}</p>
        <div className="mt-3">
          <Stepper size="lg" label="Target" value={target} onChange={setTarget} step={meta.step} decimals={meta.decimals} unit={meta.unit} max={100000} />
        </div>
        {baseline[type] !== undefined && meta.cadence === 'once' &&
        <p className="mt-3 text-center text-[12.5px] text-muted">Current: {baseline[type]} {meta.unit}</p>
        }
      </section>

      {!editing && meta.cadence === 'once' &&
      <section className="mt-6 px-4" aria-labelledby="deadline-label">
          <h2 id="deadline-label" className="px-1 text-[13px] font-medium text-muted">Timeframe</h2>
          <div className="mt-2 flex flex-wrap gap-2">
            {deadlines.map((d) => <Chip key={d} selected={d === deadline} onClick={() => setDeadline(d)}>{d}</Chip>)}
          </div>
          {type === 'weightLoss' && deadline !== 'Ongoing' &&
        <p className="mt-3 px-1 text-[12.5px] text-muted">
              That’s about {((78.4 - target) / parseInt(deadline, 10)).toFixed(2)} kg/week.{' '}
              {(78.4 - target) / parseInt(deadline, 10) > 0.75 ? 'Faster than the 0.5–0.75 kg/week most coaches recommend.' : 'A sustainable pace.'}
            </p>
        }
        </section>
      }

      <div className="mt-6 px-4">
        <TextField label="Name (optional)" placeholder={autoTitle} value={title} onChange={(e) => setTitle(e.target.value)} />
      </div>
    </Screen>);

}