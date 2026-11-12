import React, { useState, useEffect, useCallback } from 'react';
import { Plus, Trash2, Award, Sparkles, Info } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Badge } from '@/components/ui/Badge';
import { useToast } from '@/context/ToastContext';
import { challengesApi } from '../api';
import type { AdminBadge, CreateBadgeInput, BadgeCategory, BadgeTier } from '../types';

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
  const { toast } = useToast();
  const [customBadges, setCustomBadges] = useState<AdminBadge[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Form state
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState<BadgeCategory>('workout');
  const [tier, setTier] = useState<BadgeTier>('bronze');
  const [pointsValue, setPointsValue] = useState(50);
  const [iconName, setIconName] = useState('medal');

  const fetchBadges = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await challengesApi.listBadges();
      setCustomBadges(data);
    } catch {
      // Fallback silently if offline or initial load
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchBadges();
  }, [fetchBadges]);

  const handleOpenModal = () => {
    setName('');
    setSlug('');
    setDescription('');
    setCategory('workout');
    setTier('bronze');
    setPointsValue(50);
    setIconName('medal');
    setIsModalOpen(true);
  };

  const handleNameChange = (val: string) => {
    setName(val);
    if (!slug || slug === name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')) {
      setSlug(val.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, ''));
    }
  };

  const handleCreateBadge = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !slug.trim() || !description.trim()) {
      toast.error('Name, slug, and description are required.');
      return;
    }

    setIsSubmitting(true);
    try {
      const input: CreateBadgeInput = {
        name: name.trim(),
        slug: slug.trim().toLowerCase(),
        description: description.trim(),
        category,
        tier,
        pointsValue: Number(pointsValue) || 50,
        iconName: iconName.trim() || 'medal',
      };
      await challengesApi.createBadge(input);
      toast.success('Custom badge created and saved to database.');
      setIsModalOpen(false);
      await fetchBadges();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to create badge.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const [badgeToDelete, setBadgeToDelete] = useState<{ id: string; name: string } | null>(null);
  const [isDeletingBadge, setIsDeletingBadge] = useState(false);

  const handleDeleteBadge = (id: string, badgeName: string) => {
    setBadgeToDelete({ id, name: badgeName });
  };

  const handleConfirmDeleteBadge = async () => {
    if (!badgeToDelete) return;
    const { id, name: badgeName } = badgeToDelete;
    setIsDeletingBadge(true);
    try {
      await challengesApi.deleteBadge(id);
      toast.success(`Badge "${badgeName}" deleted.`);
      setBadgeToDelete(null);
      await fetchBadges();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to delete badge.');
    } finally {
      setIsDeletingBadge(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-[15px] font-semibold tracking-tight text-white">Badge catalog</h2>
          <p className="mt-0.5 text-[13px] text-ink-400">
            Achievement badges available for challenges and milestones.
          </p>
        </div>
        <button type="button" onClick={handleOpenModal} className="btn btn-primary self-start sm:self-auto">
          <Plus className="h-4 w-4" />
          Create badge
        </button>
      </div>

      <div className="alert alert-info">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-ink-400" />
        <span>
          Standard badges are built into the app. Custom badges are stored through the admin badge
          endpoints and can be deleted here.
        </span>
      </div>

      <section>
        <div className="mb-3 flex items-center gap-2">
          <Award className="h-4 w-4 text-ink-400" />
          <h3 className="text-[13px] font-semibold text-white">
            Standard badges <span className="font-normal text-ink-400">({VERIFIED_BADGES.length})</span>
          </h3>
        </div>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3 sm:gap-4">
          {VERIFIED_BADGES.map((badge) => (
            <article key={badge.id} className="card flex flex-col p-5 transition-colors hover:border-ink-700">
              <div className="flex items-start justify-between gap-3">
                <span aria-hidden="true" className="flex h-11 w-11 items-center justify-center rounded-lg bg-ink-850 text-2xl ring-1 ring-ink-800">
                  {badge.icon}
                </span>
                <Badge variant="neutral" size="sm" plain>
                  {badge.category}
                </Badge>
              </div>
              <h4 className="mt-3 text-[13px] font-semibold text-white">{badge.name}</h4>
              <p className="mt-1 flex-1 text-xs leading-relaxed text-ink-400">{badge.description}</p>
              <div className="mt-4 flex items-center justify-between border-t border-ink-800 pt-3 text-[11px] text-ink-400">
                <span className="truncate font-mono text-ink-500">{badge.id}</span>
                <span className="font-medium text-emerald-300">Standard</span>
              </div>
            </article>
          ))}
        </div>
      </section>

      {customBadges.length > 0 && (
        <section>
          <div className="mb-3 flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-ink-400" />
            <h3 className="text-[13px] font-semibold text-white">
              Custom badges <span className="font-normal text-ink-400">({customBadges.length})</span>
            </h3>
          </div>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3 sm:gap-4">
            {customBadges.map((badge) => (
              <article key={badge.id} className="card flex flex-col p-5 transition-colors hover:border-ink-700">
                <div className="flex items-start justify-between gap-3">
                  <span aria-hidden="true" className="flex h-11 w-11 items-center justify-center rounded-lg bg-ink-850 text-xl ring-1 ring-ink-800">
                    🏅
                  </span>
                  <div className="flex flex-wrap items-center justify-end gap-1.5">
                    <Badge variant="completed" size="sm" plain>
                      {badge.tier}
                    </Badge>
                    <Badge variant="neutral" size="sm" plain>
                      {badge.category}
                    </Badge>
                  </div>
                </div>
                <h4 className="mt-3 text-[13px] font-semibold text-white">{badge.name}</h4>
                <p className="mt-1 flex-1 text-xs leading-relaxed text-ink-400">{badge.description}</p>
                <div className="mt-4 flex items-center justify-between border-t border-ink-800 pt-3 text-xs">
                  <span className="font-medium tabular-nums text-ink-200">+{badge.pointsValue} pts</span>
                  <button
                    type="button"
                    onClick={() => handleDeleteBadge(badge.id, badge.name)}
                    className="btn btn-danger-ghost btn-sm -mr-2"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    Delete
                  </button>
                </div>
              </article>
            ))}
          </div>
        </section>
      )}

      <ConfirmDialog
        isOpen={Boolean(badgeToDelete)}
        onClose={() => setBadgeToDelete(null)}
        onConfirm={handleConfirmDeleteBadge}
        isBusy={isDeletingBadge}
        title="Delete badge?"
        description="This custom badge will be removed from the catalog."
        confirmLabel="Delete badge"
        busyLabel="Deleting…"
      >
        Delete <strong className="font-semibold text-white">{badgeToDelete?.name}</strong>?
      </ConfirmDialog>

      {/* Modal for Creating Custom Badge */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title="Create Custom Achievement Badge"
        description="Add a new custom badge to the gamification catalog for user challenges."
        maxWidth="md"
      >
        <form onSubmit={handleCreateBadge} className="space-y-4 text-[13px]">
          <div>
            <label htmlFor="badgescatalogcard-field-1" className="field-label">Badge Name</label>
            <input
            id="badgescatalogcard-field-1"
              type="text"
              required
              value={name}
              onChange={(e) => handleNameChange(e.target.value)}
              placeholder="e.g., Century Rider"
              className="input"
            />
          </div>

          <div>
            <label htmlFor="badgescatalogcard-field-2" className="field-label">Slug (kebab-case)</label>
            <input
            id="badgescatalogcard-field-2"
              type="text"
              required
              value={slug}
              onChange={(e) => setSlug(e.target.value.toLowerCase())}
              placeholder="e.g., century-rider"
              className="input font-mono"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="badgescatalogcard-field-3" className="field-label">Category</label>
              <select
            id="badgescatalogcard-field-3"
                value={category}
                onChange={(e) => setCategory(e.target.value as BadgeCategory)}
                className="input"
              >
                <option value="workout">Workout</option>
                <option value="streak">Streak</option>
                <option value="nutrition">Nutrition</option>
                <option value="strength">Strength</option>
                <option value="milestone">Milestone</option>
                <option value="challenge">Challenge</option>
              </select>
            </div>

            <div>
              <label htmlFor="badgescatalogcard-field-4" className="field-label">Tier</label>
              <select
            id="badgescatalogcard-field-4"
                value={tier}
                onChange={(e) => setTier(e.target.value as BadgeTier)}
                className="input"
              >
                <option value="bronze">Bronze</option>
                <option value="silver">Silver</option>
                <option value="gold">Gold</option>
                <option value="platinum">Platinum</option>
                <option value="special">Special</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="badgescatalogcard-field-5" className="field-label">Reward Points</label>
              <input
            id="badgescatalogcard-field-5"
                type="number"
                min={0}
                max={10000}
                value={pointsValue}
                onChange={(e) => setPointsValue(Number(e.target.value))}
                className="input"
              />
            </div>

            <div>
              <label htmlFor="badgescatalogcard-field-6" className="field-label">Icon Name</label>
              <input
            id="badgescatalogcard-field-6"
                type="text"
                value={iconName}
                onChange={(e) => setIconName(e.target.value)}
                placeholder="e.g. medal, flame, trophy"
                className="input"
              />
            </div>
          </div>

          <div>
            <label htmlFor="badgescatalogcard-field-7" className="field-label">Description & Criteria</label>
            <textarea
            id="badgescatalogcard-field-7"
              required
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Awarded for cycling 100 kilometers in outdoor rides..."
              className="input"
            />
          </div>

          <div className="form-actions">
            <button
              type="button"
              onClick={() => setIsModalOpen(false)}
              className="btn btn-secondary"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="btn btn-primary"
            >
              {isSubmitting ? 'Saving…' : 'Create Badge'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
