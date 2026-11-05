import React, { useEffect, useState } from 'react';
import { Loader2Icon, SearchIcon, SearchXIcon } from 'lucide-react';
import { useNavigation, useRouteParams } from '../../../app/navigation/NavigationContext';
import { Screen } from '../../../shared/components/ui/Screen';
import { TextField } from '../../../shared/components/ui/TextField';
import { EmptyState } from '../../../shared/components/ui/EmptyState';
import { mockAiTools } from '../../ai-coach/services/mockAiTools';
import { foodDatabase, recentFoodIds } from '../data/foodsMock';
import { mealLabels } from '../constants/meals';
import type { FoodItem, MealType } from '../types/nutrition';

export function FoodSearchScreen() {
  const { navigate } = useNavigation();
  const { meal = 'lunch' } = useRouteParams();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<FoodItem[] | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!query.trim()) {
      setResults(null);
      return;
    }
    setLoading(true);
    let cancelled = false;
    const t = setTimeout(async () => {
      const r = await mockAiTools.searchFood({ query });
      if (!cancelled) {
        setResults(r);
        setLoading(false);
      }
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [query]);

  const list = results ?? recentFoodIds.map((id) => foodDatabase.find((f) => f.id === id)!);

  return (
    <Screen title={`Add to ${mealLabels[meal as MealType]}`}>
      <div className="px-4">
        <TextField
          label="Search foods"
          hideLabel
          placeholder="Search foods, e.g. paneer"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          autoFocus
          trailing={loading ? <Loader2Icon size={18} className="animate-spin text-muted" aria-label="Searching" /> : <SearchIcon size={18} className="text-muted" aria-hidden="true" />} />
        
      </div>
      <h2 className="mt-5 px-5 text-[12px] font-medium text-muted">{results ? `${results.length} results` : 'Recent'}</h2>
      {results && results.length === 0 ?
      <EmptyState icon={SearchXIcon} title={`No match for “${query}”`} body="Try a simpler name, or add it manually with your own calories." actionLabel="Snap a photo instead" onAction={() => navigate('mealPhoto', { meal })} /> :

      <ul className="mt-1 divide-y divide-line px-4">
          {list.map((f) =>
        <li key={f.id}>
              <button type="button" onClick={() => navigate('foodDetail', { id: f.id, meal })} className="flex w-full items-center gap-3 py-3.5 text-left">
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[15px] font-medium text-ink">{f.name}</span>
                  <span className="block text-[12.5px] text-muted">{f.brand ? `${f.brand} · ` : ''}{f.serving}</span>
                </span>
                <span className="shrink-0 text-right">
                  <span className="block font-mono text-[14px] font-semibold text-ink">{f.kcal}</span>
                  <span className="block text-[11px] text-muted">{f.protein} g protein</span>
                </span>
              </button>
            </li>
        )}
        </ul>
      }
    </Screen>);

}