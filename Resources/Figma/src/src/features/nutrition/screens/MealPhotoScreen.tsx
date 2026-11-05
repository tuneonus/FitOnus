import React from 'react';
import { ImageIcon, XIcon } from 'lucide-react';
import { useNavigation, useRouteParams } from '../../../app/navigation/NavigationContext';
import { images } from '../../../shared/constants/images';

export function MealPhotoScreen() {
  const { goBack, replace } = useNavigation();
  const { meal = 'lunch' } = useRouteParams();
  const analyze = () => replace('mealAnalysis', { meal });

  return (
    <div className="relative flex h-full flex-col bg-black text-white">
      <img src={images.mealPhoto} alt="Camera preview of an Indian lunch plate" className="absolute inset-0 h-full w-full object-cover opacity-90" />
      <header className="relative z-10 flex items-center justify-between px-4 pt-14">
        <button type="button" onClick={goBack} aria-label="Close camera" className="flex h-11 w-11 items-center justify-center rounded-full bg-black/45"><XIcon size={20} aria-hidden="true" /></button>
        <p className="rounded-full bg-black/45 px-3 py-1.5 text-[13px] font-medium">Fit the whole plate in frame</p>
        <span className="w-11" />
      </header>
      <div className="relative z-10 mx-8 mt-10 flex-1 rounded-[32px] border-2 border-dashed border-white/70" aria-hidden="true" />
      <div className="relative z-10 flex items-center justify-between px-10 pb-12 pt-8">
        <button type="button" onClick={analyze} aria-label="Upload from photo library" className="flex h-12 w-12 items-center justify-center rounded-2xl bg-black/50">
          <ImageIcon size={22} aria-hidden="true" />
        </button>
        <button type="button" onClick={analyze} aria-label="Take photo" className="flex h-20 w-20 items-center justify-center rounded-full border-4 border-white">
          <span className="h-16 w-16 rounded-full bg-white transition-transform duration-150 active:scale-[0.94]" />
        </button>
        <span className="w-12" />
      </div>
    </div>);

}