import React from 'react';
import { CircleCheckIcon, CircleSlashIcon, Loader2Icon, RotateCcwIcon, ShieldCheckIcon } from 'lucide-react';
import { useNavigation } from '../../../../app/navigation/NavigationContext';
import { Button } from '../../../../shared/components/ui/Button';
import { showToast } from '../../../../shared/stores/toastStore';
import { executeAction } from '../../services/actionExecutor';
import type { ActionStatus, Block } from '../../types/coach';

type ActionBlockProps = {
  block: Extract<Block, {type: 'action';}>;
  onStatusChange: (status: ActionStatus, resultText?: string) => void;
};

const undoRegistry = new Map<string, () => void>();

/** Preview → confirm → success (with undo) for every AI write action. */
export function ActionBlock({ block, onStatusChange }: ActionBlockProps) {
  const { navigate } = useNavigation();

  const confirm = () => {
    onStatusChange('running');
    setTimeout(() => {
      const result = executeAction(block.payload);
      if (block.payload.kind === 'startWorkout') {
        onStatusChange('confirmed', 'Workout started');
        navigate('activeWorkout');
        return;
      }
      if (result.undo) undoRegistry.set(block.id, result.undo);
      onStatusChange('confirmed', result.message);
      showToast({
        message: result.message,
        actionLabel: result.undo ? 'Undo' : undefined,
        onAction: result.undo ? () => undo() : undefined
      });
    }, 700);
  };

  const undo = () => {
    undoRegistry.get(block.id)?.();
    undoRegistry.delete(block.id);
    onStatusChange('undone', 'Undone — nothing was saved');
  };

  const confirmLabel = {
    logMeal: 'Log meal',
    logWorkout: 'Log sets',
    updateWeight: 'Save weight',
    createPlan: 'Use plan',
    updateGoal: 'Update goal',
    startWorkout: 'Start now'
  }[block.payload.kind];

  return (
    <div className="overflow-hidden rounded-3xl border-2 border-ink/80 bg-surface">
      <div className="flex items-center gap-2 border-b border-line bg-surface2 px-4 py-2.5">
        <ShieldCheckIcon size={14} className="text-ink" aria-hidden="true" />
        <p className="text-[12px] font-medium text-muted">Needs your confirmation</p>
      </div>
      <div className="p-4">
        <h4 className="text-[16px] font-semibold text-ink">{block.title}</h4>
        <dl className="mt-2 divide-y divide-line">
          {block.summary.map((s) =>
          <div key={s.label} className="flex justify-between gap-3 py-2 text-[13.5px]">
              <dt className="text-muted">{s.label}</dt>
              <dd className="text-right font-medium text-ink">
                {s.value}
                {s.estimated && <span className="ml-1 rounded border border-dashed border-muted px-1 text-[10px] font-normal text-muted">Est.</span>}
              </dd>
            </div>
          )}
        </dl>

        <div className="mt-3" aria-live="polite">
          {block.status === 'pending' &&
          <div className="flex gap-2">
              <Button variant="secondary" className="flex-1" onClick={() => onStatusChange('cancelled', 'Cancelled')}>
                Cancel
              </Button>
              {block.payload.kind === 'logMeal' &&
            <Button variant="outline" className="flex-1" onClick={() => navigate('foodSearch', { meal: (block.payload as {meal: string;}).meal })}>
                  Edit
                </Button>
            }
              <Button className="flex-1" onClick={confirm}>
                {confirmLabel}
              </Button>
            </div>
          }
          {block.status === 'running' &&
          <p className="flex items-center gap-2 py-2 text-[14px] text-muted">
              <Loader2Icon size={16} className="animate-spin" aria-hidden="true" /> Saving…
            </p>
          }
          {block.status === 'confirmed' &&
          <div className="flex items-center justify-between rounded-2xl bg-good/10 px-3 py-2.5">
              <p className="flex items-center gap-2 text-[14px] font-semibold text-good">
                <CircleCheckIcon size={16} aria-hidden="true" /> {block.resultText}
              </p>
              {undoRegistry.has(block.id) &&
            <button type="button" onClick={undo} className="flex h-8 items-center gap-1 rounded-full px-2 text-[13px] font-semibold text-ink">
                  <RotateCcwIcon size={13} aria-hidden="true" /> Undo
                </button>
            }
            </div>
          }
          {(block.status === 'cancelled' || block.status === 'undone') &&
          <p className="flex items-center gap-2 py-1.5 text-[13.5px] text-muted">
              <CircleSlashIcon size={15} aria-hidden="true" /> {block.resultText}
            </p>
          }
        </div>
      </div>
    </div>);

}