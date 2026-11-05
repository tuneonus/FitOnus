import React, { useState } from 'react';
import { BottomSheet } from '../../../shared/components/ui/BottomSheet';
import { Button } from '../../../shared/components/ui/Button';
import { Stepper } from '../../../shared/components/ui/Stepper';
import { TextField } from '../../../shared/components/ui/TextField';
import { showToast } from '../../../shared/stores/toastStore';
import { useWeightStore } from '../store/weightStore';

export function AddWeightSheet({ open, onClose }: {open: boolean;onClose: () => void;}) {
  const { entries, addEntry, undoLast } = useWeightStore();
  const [value, setValue] = useState(entries[entries.length - 1].value);
  const [note, setNote] = useState('');

  const save = () => {
    const prev = addEntry(value, note || undefined);
    showToast({ message: `${value.toFixed(1)} kg saved for today`, actionLabel: 'Undo', onAction: () => undoLast(prev) });
    setNote('');
    onClose();
  };

  return (
    <BottomSheet open={open} onClose={onClose} title="Log weight" description="Today · Fri, Oct 9" footer={<Button size="lg" fullWidth onClick={save}>Save</Button>}>
      <div className="py-4">
        <Stepper size="lg" label="Weight" value={value} onChange={setValue} step={0.1} decimals={1} min={30} max={250} unit="kg" />
      </div>
      <TextField label="Note (optional)" placeholder="e.g. after a high-salt dinner" value={note} onChange={(e) => setNote(e.target.value)} />
      <p className="mt-3 text-[12.5px] text-muted">Tip: weigh at the same time each morning. Smart-scale sync is planned for a future release.</p>
    </BottomSheet>);

}