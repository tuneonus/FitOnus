import React from 'react';

export interface VerifiedBadge {
  id: string;
  name: string;
  category: 'streak' | 'workout' | 'nutrition' | 'community';
  description: string;
  icon: string;
  criteria: string;
  isSystemStandard: boolean;
}

export const VERIFIED_BADGES: VerifiedBadge[] = [
  {
    id: 'badge_streak_7',
    name: '7-Day Warrior',
    category: 'streak',
    description: 'Awarded for completing all planned workout and nutrition logs 7 days in a row.',
    icon: '🔥',
    criteria: '7-day consecutive activity logging',
    isSystemStandard: true,
  },
  {
    id: 'badge_5k_runner',
    name: '5K Finisher',
    category: 'workout',
    description: 'Awarded for completing a 5,000 meter running or walking activity in a single workout.',
    icon: '🏃',
    criteria: '5km running distance recorded',
    isSystemStandard: true,
  },
  {
    id: 'badge_heavy_lifter',
    name: 'Century Lifter',
    category: 'workout',
    description: 'Awarded for completing bench press, deadlift, or squat sessions totalling over 10,000 kg volume.',
    icon: '🏋️',
    criteria: '10,000kg aggregate workout volume',
    isSystemStandard: true,
  },
  {
    id: 'badge_hydration_master',
    name: 'Hydration Hero',
    category: 'nutrition',
    description: 'Awarded for hitting daily water consumption targets 5 consecutive days.',
    icon: '💧',
    criteria: '5-day water intake goal achieved',
    isSystemStandard: true,
  },
  {
    id: 'badge_calorie_master',
    name: 'Nutrition Precision',
    category: 'nutrition',
    description: 'Awarded for staying within ±5% of macronutrient targets across a full week.',
    icon: '🥗',
    criteria: '7 days macronutrient compliance',
    isSystemStandard: true,
  },
];

export function BadgesCatalogCard() {
  return (
    <div className="space-y-6">
      {/* Header with Title and Create Action Status */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 p-5 bg-neutral-900 border border-neutral-800 rounded-xl">
        <div>
          <h3 className="text-lg font-bold text-white flex items-center gap-2">
            <span>🎖️</span> Gamification Badges Catalog
          </h3>
          <p className="text-xs text-neutral-400 mt-1">
            Registered achievement badges available for assignment to user challenges and milestones.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            disabled
            title="Custom badge creation requires pending backend endpoint POST /api/v1/admin/challenges/badges"
            className="px-4 py-2 rounded-lg bg-neutral-800 text-neutral-500 border border-neutral-700 text-sm font-medium cursor-not-allowed opacity-70 flex items-center gap-2"
          >
            <span>+ Create Custom Badge</span>
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30">
              API Pending
            </span>
          </button>
        </div>
      </div>

      {/* Backend API Requirement Banner */}
      <div className="p-4 bg-amber-950/20 border border-amber-800/40 rounded-xl text-xs text-amber-300/90 flex items-start gap-3">
        <span className="text-base mt-0.5">ℹ️</span>
        <div>
          <p className="font-semibold text-amber-200">Backend Endpoint Requirement (Phase 11):</p>
          <p className="mt-0.5 text-neutral-400">
            Dynamic administrative CRUD for badges (<code className="text-neutral-200">POST /api/v1/admin/challenges/badges</code> and <code className="text-neutral-200">DELETE /api/v1/admin/challenges/badges/:id</code>) is planned for Phase 11. Challenges currently link to system-verified badge identifiers via <code className="text-neutral-200">rewardBadgeId</code>.
          </p>
        </div>
      </div>

      {/* Badges Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {VERIFIED_BADGES.map((badge) => (
          <div
            key={badge.id}
            className="p-5 bg-neutral-900/60 border border-neutral-800/80 rounded-xl hover:border-neutral-700 transition flex flex-col justify-between"
          >
            <div>
              <div className="flex items-start justify-between">
                <span className="text-3xl p-2 bg-neutral-800 rounded-lg">{badge.icon}</span>
                <span className="px-2 py-0.5 text-[10px] font-semibold tracking-wider uppercase rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                  {badge.category}
                </span>
              </div>
              <h4 className="text-sm font-bold text-white mt-3">{badge.name}</h4>
              <p className="text-xs text-neutral-400 mt-1.5 leading-relaxed">{badge.description}</p>
            </div>

            <div className="mt-4 pt-3 border-t border-neutral-800/60 flex items-center justify-between text-[11px] text-neutral-400">
              <span className="font-mono text-neutral-300">ID: {badge.id}</span>
              <span className="text-emerald-400 font-medium">Static Standard Catalog</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
