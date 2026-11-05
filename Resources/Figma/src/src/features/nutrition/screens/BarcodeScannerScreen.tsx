import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { FlashlightIcon, KeyboardIcon, XIcon } from 'lucide-react';
import { useNavigation, useRouteParams } from '../../../app/navigation/NavigationContext';
import { BottomSheet } from '../../../shared/components/ui/BottomSheet';
import { Button } from '../../../shared/components/ui/Button';
import { TextField } from '../../../shared/components/ui/TextField';
import { barcodeProduct } from '../data/foodsMock';

export function BarcodeScannerScreen() {
  const { goBack, replace } = useNavigation();
  const { meal = 'snacks' } = useRouteParams();
  const [found, setFound] = useState(false);
  const [manual, setManual] = useState(false);
  const [code, setCode] = useState('');
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setFound(true), 2600);
    return () => clearTimeout(t);
  }, []);

  const lookup = () => {
    if (code.trim().length >= 8) {
      setManual(false);
      setFound(true);
    } else setNotFound(true);
  };

  return (
    <div className="relative flex h-full flex-col bg-black text-white">
      <header className="relative z-10 flex items-center justify-between px-4 pt-14">
        <button type="button" onClick={goBack} aria-label="Close scanner" className="flex h-11 w-11 items-center justify-center rounded-full bg-white/15"><XIcon size={20} aria-hidden="true" /></button>
        <p className="text-[15px] font-semibold">Scan barcode</p>
        <button type="button" aria-label="Toggle flashlight" className="flex h-11 w-11 items-center justify-center rounded-full bg-white/15"><FlashlightIcon size={18} aria-hidden="true" /></button>
      </header>
      <div className="flex flex-1 flex-col items-center justify-center px-8">
        <div className="relative h-44 w-full max-w-[300px] rounded-3xl border-2 border-white/80" aria-hidden="true">
          {!found &&
          <motion.span
            className="absolute inset-x-4 h-0.5 rounded-full bg-accent"
            animate={{ top: ['12%', '88%', '12%'] }}
            transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }} />

          }
        </div>
        <p className="mt-6 text-center text-[14px] text-white/75" aria-live="polite">
          {found ? 'Barcode detected' : 'Line up the barcode inside the frame'}
        </p>
        <p className="mt-1 text-center text-[12px] text-white/50">Camera preview is simulated in this prototype.</p>
      </div>
      <div className="px-5 pb-10">
        <button type="button" onClick={() => setManual(true)} className="flex h-12 w-full items-center justify-center gap-2 rounded-full bg-white/15 text-[15px] font-semibold">
          <KeyboardIcon size={18} aria-hidden="true" /> Enter barcode manually
        </button>
      </div>

      <BottomSheet open={found} onClose={() => setFound(false)} title={barcodeProduct.name} description={`${barcodeProduct.brand} · ${barcodeProduct.serving}`}
      footer={<Button size="lg" fullWidth onClick={() => replace('foodDetail', { id: barcodeProduct.id, meal, source: 'barcode' })}>Review & add</Button>}>
        <dl className="grid grid-cols-4 gap-2 rounded-2xl bg-surface2 p-3 text-center">
          {[['kcal', barcodeProduct.kcal], ['Protein', `${barcodeProduct.protein}g`], ['Carbs', `${barcodeProduct.carbs}g`], ['Fat', `${barcodeProduct.fat}g`]].map(([l, v]) =>
          <div key={l}><dt className="text-[11px] text-muted">{l}</dt><dd className="font-mono text-[15px] font-semibold text-ink">{v}</dd></div>
          )}
        </dl>
        <p className="mt-3 text-[12.5px] text-muted">Values from the product label database.</p>
      </BottomSheet>

      <BottomSheet open={manual} onClose={() => setManual(false)} title="Enter barcode" footer={<Button size="lg" fullWidth onClick={lookup}>Look up</Button>}>
        <TextField label="Barcode number" inputMode="numeric" placeholder="13 digits" value={code} onChange={(e) => {setCode(e.target.value.replace(/\D/g, ''));setNotFound(false);}} error={notFound ? 'We couldn’t find that product. Check the number or search by name.' : undefined} />
      </BottomSheet>
    </div>);

}