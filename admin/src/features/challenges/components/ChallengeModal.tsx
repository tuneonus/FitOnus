'use client';

import React, { useState, useEffect } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Trophy, Sparkles, AlertCircle } from 'lucide-react';
import type {
  Challenge,
  CreateChallengeInput,
  UpdateChallengeInput,
  ChallengeCadence,
  ChallengeCategory,
  ChallengeMetricType,
} from '../types';
import {
  CADENCE_LABELS,
  CATEGORY_LABELS,
  METRIC_TYPE_LABELS,
} from '../types';

interface ChallengeModalProps {
  isOpen: boolean;
  onClose: () => void;
  challenge: Challenge | null;
  onSubmit: (data: CreateChallengeInput | UpdateChallengeInput) => Promise<void>;
}

const CADENCES: ChallengeCadence[] = ['daily', 'weekly', 'monthly', 'special', 'custom'];
const CATEGORIES: ChallengeCategory[] = ['workout', 'habit', 'nutrition', 'hydration', 'mixed'];
const METRIC_TYPES: ChallengeMetricType[] = [
  'workout_count',
  'workout_duration_min',
  'workout_volume_kg',
  'habit_completion_count',
  'habit_streak_days',
  'water_liters',
  'calorie_compliance_days',
  'protein_target_days',
  'personal_record_count',
];

export function ChallengeModal({
  isOpen,
  onClose,
  challenge,
  onSubmit,
}: ChallengeModalProps) {
  const isEditing = Boolean(challenge);

  // Form states
  const [slug, setSlug] = useState('');
  const [slugManuallyEdited, setSlugManuallyEdited] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [cadence, setCadence] = useState<ChallengeCadence>('weekly');
  const [category, setCategory] = useState<ChallengeCategory>('workout');
  const [metricType, setMetricType] = useState<ChallengeMetricType>('workout_count');
  const [targetValue, setTargetValue] = useState<number>(5);
  const [rewardPoints, setRewardPoints] = useState<number>(50);
  const [rewardBadgeId, setRewardBadgeId] = useState<string>('');
  const [autoEnroll, setAutoEnroll] = useState<boolean>(true);
  const [iconName, setIconName] = useState<string>('trophy');
  const [bannerColor, setBannerColor] = useState<string>('teal');

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Populate on open / change
  useEffect(() => {
    if (challenge) {
      setSlug(challenge.slug);
      setTitle(challenge.title);
      setDescription(challenge.description);
      setCadence(challenge.cadence);
      setCategory(challenge.category);
      setMetricType(challenge.metricType);
      setTargetValue(challenge.targetValue);
      setRewardPoints(challenge.rewardPoints);
      setRewardBadgeId(challenge.rewardBadgeId || '');
      setAutoEnroll(challenge.autoEnroll);
      setIconName(challenge.iconName || 'trophy');
      setBannerColor(challenge.bannerColor || 'teal');
      setSlugManuallyEdited(true);
    } else {
      setSlug('');
      setTitle('');
      setDescription('');
      setCadence('weekly');
      setCategory('workout');
      setMetricType('workout_count');
      setTargetValue(5);
      setRewardPoints(50);
      setRewardBadgeId('');
      setAutoEnroll(true);
      setIconName('trophy');
      setBannerColor('teal');
      setSlugManuallyEdited(false);
    }
    setError(null);
  }, [challenge, isOpen]);

  // Auto-generate slug from title for new challenges
  const handleTitleChange = (val: string) => {
    setTitle(val);
    if (!isEditing && !slugManuallyEdited) {
      const generated = val
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 100);
      setSlug(generated);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;

    if (!title.trim() || title.trim().length < 2) {
      setError('Title must be at least 2 characters.');
      return;
    }
    if (!description.trim() || description.trim().length < 5) {
      setError('Description must be at least 5 characters.');
      return;
    }
    if (targetValue <= 0 || Number.isNaN(targetValue)) {
      setError('Target value must be greater than 0.');
      return;
    }
    if (rewardPoints < 0 || Number.isNaN(rewardPoints)) {
      setError('Reward points cannot be negative.');
      return;
    }

    if (!isEditing) {
      if (!slug.trim() || !/^[a-z0-9_-]+$/.test(slug)) {
        setError('Slug must be lowercase alphanumeric with hyphens or underscores (min 2 chars).');
        return;
      }
    }

    setIsSubmitting(true);
    setError(null);

    try {
      if (isEditing) {
        const updatePayload: UpdateChallengeInput = {
          title: title.trim(),
          description: description.trim(),
          targetValue: Number(targetValue),
          rewardPoints: Number(rewardPoints),
          rewardBadgeId: rewardBadgeId.trim() || null,
          autoEnroll,
          iconName: iconName.trim() || 'trophy',
          bannerColor: bannerColor.trim() || 'teal',
        };
        await onSubmit(updatePayload);
      } else {
        const createPayload: CreateChallengeInput = {
          slug: slug.trim(),
          title: title.trim(),
          description: description.trim(),
          cadence,
          category,
          metricType,
          targetValue: Number(targetValue),
          rewardPoints: Number(rewardPoints),
          rewardBadgeId: rewardBadgeId.trim() || null,
          autoEnroll,
          iconName: iconName.trim() || 'trophy',
          bannerColor: bannerColor.trim() || 'teal',
        };
        await onSubmit(createPayload);
      }
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred while saving the challenge.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={isEditing ? `Edit Challenge: ${challenge?.title}` : 'Create New Challenge'}
      description={
        isEditing
          ? 'Modify challenge configuration and rewards. Cadence, category, and metric types are immutable.'
          : 'Define a new community or automated challenge with clear goals and point rewards.'
      }
      maxWidth="xl"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <div className="flex items-start gap-2.5 rounded-xl border border-rose-500/20 bg-rose-500/10 p-3.5 text-xs text-rose-300">
            <AlertCircle className="h-4 w-4 shrink-0 mt-0.5 text-rose-400" />
            <div>{error}</div>
          </div>
        )}

        {/* Title */}
        <div>
          <label className="block text-xs font-semibold text-slate-300 mb-1.5">
            Challenge Title <span className="text-teal-400">*</span>
          </label>
          <input
            type="text"
            required
            value={title}
            onChange={(e) => handleTitleChange(e.target.value)}
            placeholder="e.g. 5-Day Workout Warrior"
            className="w-full rounded-xl border border-slate-700 bg-slate-800/80 px-3.5 py-2.5 text-xs text-white placeholder-slate-500 focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500"
          />
        </div>

        {/* Slug */}
        <div>
          <label className="block text-xs font-semibold text-slate-300 mb-1.5">
            Slug (Unique URL identifier) <span className="text-teal-400">*</span>
          </label>
          {isEditing ? (
            <div className="rounded-xl border border-slate-800 bg-slate-950/60 px-3.5 py-2.5 text-xs text-slate-400 font-mono">
              {slug}
              <span className="ml-2 text-[10px] text-slate-500">(Immutable)</span>
            </div>
          ) : (
            <input
              type="text"
              required
              value={slug}
              onChange={(e) => {
                setSlugManuallyEdited(true);
                setSlug(e.target.value);
              }}
              placeholder="e.g. 5-day-workout-warrior"
              className="w-full rounded-xl border border-slate-700 bg-slate-800/80 px-3.5 py-2.5 text-xs text-white placeholder-slate-500 font-mono focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500"
            />
          )}
        </div>

        {/* Description */}
        <div>
          <label className="block text-xs font-semibold text-slate-300 mb-1.5">
            Description <span className="text-teal-400">*</span>
          </label>
          <textarea
            required
            rows={3}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Explain the objective, rules, and how users qualify..."
            className="w-full rounded-xl border border-slate-700 bg-slate-800/80 px-3.5 py-2.5 text-xs text-white placeholder-slate-500 focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500 resize-none"
          />
        </div>

        {/* Cadence & Category */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1.5">
              Cadence <span className="text-teal-400">*</span>
            </label>
            {isEditing ? (
              <div className="rounded-xl border border-slate-800 bg-slate-950/60 px-3.5 py-2.5 text-xs text-slate-400">
                {CADENCE_LABELS[cadence]}
                <span className="ml-2 text-[10px] text-slate-500">(Immutable)</span>
              </div>
            ) : (
              <select
                value={cadence}
                onChange={(e) => setCadence(e.target.value as ChallengeCadence)}
                className="w-full rounded-xl border border-slate-700 bg-slate-800/80 px-3 py-2.5 text-xs text-white focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500"
              >
                {CADENCES.map((c) => (
                  <option key={c} value={c}>
                    {CADENCE_LABELS[c]}
                  </option>
                ))}
              </select>
            )}
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1.5">
              Category <span className="text-teal-400">*</span>
            </label>
            {isEditing ? (
              <div className="rounded-xl border border-slate-800 bg-slate-950/60 px-3.5 py-2.5 text-xs text-slate-400">
                {CATEGORY_LABELS[category]}
                <span className="ml-2 text-[10px] text-slate-500">(Immutable)</span>
              </div>
            ) : (
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value as ChallengeCategory)}
                className="w-full rounded-xl border border-slate-700 bg-slate-800/80 px-3 py-2.5 text-xs text-white focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500"
              >
                {CATEGORIES.map((cat) => (
                  <option key={cat} value={cat}>
                    {CATEGORY_LABELS[cat]}
                  </option>
                ))}
              </select>
            )}
          </div>
        </div>

        {/* Metric Type & Target Value */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1.5">
              Metric Type <span className="text-teal-400">*</span>
            </label>
            {isEditing ? (
              <div className="rounded-xl border border-slate-800 bg-slate-950/60 px-3.5 py-2.5 text-xs text-slate-400">
                {METRIC_TYPE_LABELS[metricType]}
                <span className="ml-2 text-[10px] text-slate-500">(Immutable)</span>
              </div>
            ) : (
              <select
                value={metricType}
                onChange={(e) => setMetricType(e.target.value as ChallengeMetricType)}
                className="w-full rounded-xl border border-slate-700 bg-slate-800/80 px-3 py-2.5 text-xs text-white focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500"
              >
                {METRIC_TYPES.map((m) => (
                  <option key={m} value={m}>
                    {METRIC_TYPE_LABELS[m]}
                  </option>
                ))}
              </select>
            )}
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1.5">
              Target Value <span className="text-teal-400">*</span>
            </label>
            <input
              type="number"
              min={1}
              step="any"
              required
              value={targetValue}
              onChange={(e) => setTargetValue(parseFloat(e.target.value) || 0)}
              className="w-full rounded-xl border border-slate-700 bg-slate-800/80 px-3.5 py-2.5 text-xs text-white focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500"
            />
          </div>
        </div>

        {/* Reward Points & Badge ID */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1.5">
              Reward Points <span className="text-teal-400">*</span>
            </label>
            <input
              type="number"
              min={0}
              required
              value={rewardPoints}
              onChange={(e) => setRewardPoints(parseInt(e.target.value, 10) || 0)}
              className="w-full rounded-xl border border-slate-700 bg-slate-800/80 px-3.5 py-2.5 text-xs text-white focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1.5">
              Badge Reward ID (Optional UUID)
            </label>
            <input
              type="text"
              value={rewardBadgeId}
              onChange={(e) => setRewardBadgeId(e.target.value)}
              placeholder="e.g. 11111111-2222-3333-4444-555555555555"
              className="w-full rounded-xl border border-slate-700 bg-slate-800/80 px-3.5 py-2.5 text-xs text-white font-mono placeholder-slate-500 focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500"
            />
          </div>
        </div>

        {/* Visual customization & Auto Enroll */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5 pt-1">
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1.5">Icon Name</label>
            <input
              type="text"
              value={iconName}
              onChange={(e) => setIconName(e.target.value)}
              placeholder="trophy"
              className="w-full rounded-xl border border-slate-700 bg-slate-800/80 px-3 py-2 text-xs text-white focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1.5">Banner Color</label>
            <input
              type="text"
              value={bannerColor}
              onChange={(e) => setBannerColor(e.target.value)}
              placeholder="teal"
              className="w-full rounded-xl border border-slate-700 bg-slate-800/80 px-3 py-2 text-xs text-white focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500"
            />
          </div>

          <div className="flex flex-col justify-end">
            <label className="flex items-center gap-2 cursor-pointer py-2">
              <input
                type="checkbox"
                checked={autoEnroll}
                onChange={(e) => setAutoEnroll(e.target.checked)}
                className="rounded border-slate-700 bg-slate-800 text-teal-500 focus:ring-teal-500 h-4 w-4"
              />
              <span className="text-xs font-medium text-slate-300">Auto-Enroll Users</span>
            </label>
          </div>
        </div>

        {/* Footer actions */}
        <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-800">
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="rounded-xl border border-slate-700 px-4 py-2 text-xs font-medium text-slate-300 hover:bg-slate-800 transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={isSubmitting}
            className="flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-teal-500 to-emerald-500 px-5 py-2 text-xs font-semibold text-slate-950 hover:from-teal-400 hover:to-emerald-400 transition-all shadow-md shadow-teal-500/20 disabled:opacity-50"
          >
            {isSubmitting ? (
              <span>Saving...</span>
            ) : (
              <>
                <Sparkles className="h-3.5 w-3.5" />
                <span>{isEditing ? 'Save Changes' : 'Create Challenge'}</span>
              </>
            )}
          </button>
        </div>
      </form>
    </Modal>
  );
}

