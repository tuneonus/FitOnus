import React, { useState } from 'react';
import { Trash2Icon } from 'lucide-react';
import { BottomSheet } from '../../../shared/components/ui/BottomSheet';
import { Button } from '../../../shared/components/ui/Button';
import { Stepper } from '../../../shared/components/ui/Stepper';
import { showToast } from '../../../shared/stores/toastStore';
import { useNutritionStore } from '../store/nutritionStore';
import type { FoodItem, MealEntry } from '../types/nutrition';

type FoodItemSheetProps = {target: {entry: MealEntry;item: FoodItem;} | null;onClose: () => void;};

/** Meal editing: adjust portion or remove a logged item. */
export function FoodItemSheet({ target, onClose }: FoodItemSheetProps) {
  const { scaleItem, removeItem, restoreEntry } = useNutritionStore();
  const [factor, setFactor] = useState(1);

  const close = () => {
    setFactor(1);
    onClose();
  };

  if (!target) return <BottomSheet open={false} onClose={close}>{null}</BottomSheet>;
  const { entry, item } = target;

  return (
    <BottomSheet
      open
      onClose={close}
      title={item.name}
      description={`${item.serving}${item.estimated ? ' · AI estimate' : ''}`}
      footer={
      <div className="flex gap-2">
          <Button
          variant="danger"
          size="lg"
          icon={Trash2Icon}
          onClick={() => {
            removeItem(entry.id, item.id);
            showToast({ message: `${item.name} removed`, actionLabel: 'Undo', onAction: () => {useNutritionStore.getState().removeEntry(entry.id);restoreEntry(entry);} });
            close();
          }}>
          
            Remove
          </Button>
          <Button
          size="lg"
          className="flex-1"
          disabled={factor === 1}
          onClick={() => {
            scaleItem(entry.id, item.id, factor);
            showToast({ message: 'Portion updated' });
            close();
          }}>
          
            Save
          </Button>
        </div>
      }>
      
      <p className="text-[13px] text-muted">Portion</p>
      <div className="mt-2">
        <Stepper label="Portion multiplier" value={factor} onChange={setFactor} step={0.25} min={0.25} max={4} decimals={2} unit="×" />
      </div>
      <dl className="mt-5 grid grid-cols-4 gap-2 rounded-2xl bg-surface2 p-3 text-center">
        {[
        ['kcal', Math.round(item.kcal * factor)],
        ['Protein', `${Math.round(item.protein * factor)}g`],
        ['Carbs', `${Math.round(item.carbs * factor)}g`],
        ['Fat', `${Math.round(item.fat * factor)}g`]].
        map(([l, v]) =>
        <div key={l}>
            <dt className="text-[11px] text-muted">{l}</dt>
            <dd className="font-mono text-[15px] font-semibold text-ink">{v}</dd>
          </div>
        )}
      </dl>
    </BottomSheet>);

}