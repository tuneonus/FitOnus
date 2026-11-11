'use client';

import React, { useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Sparkles, AlertCircle } from 'lucide-react';
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
  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={challenge ? `Edit Challenge: ${challenge.title}` : 'Create New Challenge'}
      description={
        challenge
          ? 'Modify challenge configuration and rewards. Cadence, category, and metric types are immutable.'
          : 'Define a new community or automated challenge with clear goals and point rewards.'
      }
      maxWidth="xl"
    >
      <ChallengeForm
        key={challenge ? challenge.id : 'create-new'}
        challenge={challenge}
        onClose={onClose}
        onSubmit={onSubmit}
      />
    </Modal>
  );
}

function ChallengeForm({
  challenge,
  onClose,
  onSubmit,
}: {
  challenge: Challenge | null;
  onClose: () => void;
  onSubmit: (data: CreateChallengeInput | UpdateChallengeInput) => Promise<void>;
}) {
  const isEditing = Boolean(challenge);

  // Form states initialized directly from props
  const [slug, setSlug] = useState(challenge ? challenge.slug : '');
  const [slugManuallyEdited, setSlugManuallyEdited] = useState(Boolean(challenge));
  const [title, setTitle] = useState(challenge ? challenge.title : '');
  const [description, setDescription] = useState(challenge ? challenge.description : '');
  const [cadence, setCadence] = useState<ChallengeCadence>(challenge ? challenge.cadence : 'weekly');
  const [category, setCategory] = useState<ChallengeCategory>(challenge ? challenge.category : 'workout');
  const [metricType, setMetricType] = useState<ChallengeMetricType>(challenge ? challenge.metricType : 'workout_count');
  const [targetValue, setTargetValue] = useState<number>(challenge ? challenge.targetValue : 5);
  const [rewardPoints, setRewardPoints] = useState<number>(challenge ? challenge.rewardPoints : 50);
  const [rewardBadgeId, setRewardBadgeId] = useState<string>(challenge?.rewardBadgeId || '');
  const [autoEnroll, setAutoEnroll] = useState<boolean>(challenge ? challenge.autoEnroll : true);
  const [iconName, setIconName] = useState<string>(challenge?.iconName || 'trophy');
  const [bannerColor, setBannerColor] = useState<string>(challenge?.bannerColor || 'teal');

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
          Unique Slug <span className="text-teal-400">*</span>
        </label>
        <input
          type="text"
          required
          disabled={isEditing}
          value={slug}
          onChange={(e) => {
            setSlug(e.target.value);
            setSlugManuallyEdited(true);
          }}
          placeholder="e.g. 5-day-workout-warrior"
          className="w-full rounded-xl border border-slate-700 bg-slate-800/80 px-3.5 py-2.5 text-xs text-white placeholder-slate-500 focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500 disabled:opacity-50 disabled:cursor-not-allowed font-mono"
        />
        <p className="mt-1 text-[11px] text-slate-400">
          {isEditing
            ? 'Slug cannot be modified once created.'
            : 'Unique identifier used for tracking and URL references.'}
        </p>
      </div>

      {/* Description */}
      <div>
        <label className="block text-xs font-semibold text-slate-300 mb-1.5">
          Description <span className="text-teal-400">*</span>
        </label>
        <textarea
          rows={3}
          required
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Detailed challenge instructions, motivation, and rules..."
          className="w-full rounded-xl border border-slate-700 bg-slate-800/80 px-3.5 py-2.5 text-xs text-white placeholder-slate-500 focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500"
        />
      </div>

      {/* Cadence, Category, Metric Type (Locked in edit mode) */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
        <div>
          <label className="block text-xs font-semibold text-slate-300 mb-1.5">
            Cadence {!isEditing && <span className="text-teal-400">*</span>}
          </label>
          <select
            disabled={isEditing}
            value={cadence}
            onChange={(e) => setCadence(e.target.value as ChallengeCadence)}
            className="w-full rounded-xl border border-slate-700 bg-slate-800/80 px-3 py-2 text-xs text-white focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {CADENCES.map((c) => (
              <option key={c} value={c}>
                {CADENCE_LABELS[c]}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-xs font-semibold text-slate-300 mb-1.5">
            Category {!isEditing && <span className="text-teal-400">*</span>}
          </label>
          <select
            disabled={isEditing}
            value={category}
            onChange={(e) => setCategory(e.target.value as ChallengeCategory)}
            className="w-full rounded-xl border border-slate-700 bg-slate-800/80 px-3 py-2 text-xs text-white focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {CATEGORIES.map((cat) => (
              <option key={cat} value={cat}>
                {CATEGORY_LABELS[cat]}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-xs font-semibold text-slate-300 mb-1.5">
            Metric {!isEditing && <span className="text-teal-400">*</span>}
          </label>
          <select
            disabled={isEditing}
            value={metricType}
            onChange={(e) => setMetricType(e.target.value as ChallengeMetricType)}
            className="w-full rounded-xl border border-slate-700 bg-slate-800/80 px-3 py-2 text-xs text-white focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {METRIC_TYPES.map((m) => (
              <option key={m} value={m}>
                {METRIC_TYPE_LABELS[m]}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Target Value & Points */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
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
            placeholder="e.g. 5"
            className="w-full rounded-xl border border-slate-700 bg-slate-800/80 px-3.5 py-2 text-xs text-white focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500"
          />
          <p className="mt-1 text-[11px] text-slate-400">
            Units correspond to chosen metric (e.g., workouts, minutes, kg).
          </p>
        </div>

        <div>
          <label className="block text-xs font-semibold text-slate-300 mb-1.5">
            Reward Points <span className="text-teal-400">*</span>
          </label>
          <input
            type="number"
            min={0}
            step={5}
            required
            value={rewardPoints}
            onChange={(e) => setRewardPoints(parseInt(e.target.value, 10) || 0)}
            placeholder="e.g. 50"
            className="w-full rounded-xl border border-slate-700 bg-slate-800/80 px-3.5 py-2 text-xs text-white focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500"
          />
          <p className="mt-1 text-[11px] text-slate-400">
            OnusFit points awarded to the member upon completion.
          </p>
        </div>
      </div>

      {/* Badge ID */}
      <div>
        <label className="block text-xs font-semibold text-slate-300 mb-1.5">
          Reward Badge ID <span className="text-slate-500">(Optional)</span>
        </label>
        <input
          type="text"
          value={rewardBadgeId}
          onChange={(e) => setRewardBadgeId(e.target.value)}
          placeholder="e.g. badge_warrior_gold"
          className="w-full rounded-xl border border-slate-700 bg-slate-800/80 px-3.5 py-2 text-xs text-white placeholder-slate-500 focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500 font-mono"
        />
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
  );
}
