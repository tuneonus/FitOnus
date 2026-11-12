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
        <div className="alert alert-error">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <div>{error}</div>
        </div>
      )}

      {/* Title */}
      <div>
        <label htmlFor="challengemodal-field-1" className="field-label">
          Challenge Title <span className="text-rose-300" aria-hidden="true">*</span>
        </label>
        <input
            id="challengemodal-field-1"
          type="text"
          required
          value={title}
          onChange={(e) => handleTitleChange(e.target.value)}
          placeholder="e.g. 5-Day Workout Warrior"
          className="input"
        />
      </div>

      {/* Slug */}
      <div>
        <label htmlFor="challengemodal-field-2" className="field-label">
          Unique Slug <span className="text-rose-300" aria-hidden="true">*</span>
        </label>
        <input
            id="challengemodal-field-2"
          type="text"
          required
          disabled={isEditing}
          value={slug}
          onChange={(e) => {
            setSlug(e.target.value);
            setSlugManuallyEdited(true);
          }}
          placeholder="e.g. 5-day-workout-warrior"
          className="input font-mono"
        />
        <p className="field-hint">
          {isEditing
            ? 'Slug cannot be modified once created.'
            : 'Unique identifier used for tracking and URL references.'}
        </p>
      </div>

      {/* Description */}
      <div>
        <label htmlFor="challengemodal-field-3" className="field-label">
          Description <span className="text-rose-300" aria-hidden="true">*</span>
        </label>
        <textarea
            id="challengemodal-field-3"
          rows={3}
          required
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Detailed challenge instructions, motivation, and rules..."
          className="input"
        />
      </div>

      {/* Cadence, Category, Metric Type (Locked in edit mode) */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
        <div>
          <label htmlFor="challengemodal-field-4" className="field-label">
            Cadence {!isEditing && <span className="text-rose-300" aria-hidden="true">*</span>}
          </label>
          <select
            id="challengemodal-field-4"
            disabled={isEditing}
            value={cadence}
            onChange={(e) => setCadence(e.target.value as ChallengeCadence)}
            className="input"
          >
            {CADENCES.map((c) => (
              <option key={c} value={c}>
                {CADENCE_LABELS[c]}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="challengemodal-field-5" className="field-label">
            Category {!isEditing && <span className="text-rose-300" aria-hidden="true">*</span>}
          </label>
          <select
            id="challengemodal-field-5"
            disabled={isEditing}
            value={category}
            onChange={(e) => setCategory(e.target.value as ChallengeCategory)}
            className="input"
          >
            {CATEGORIES.map((cat) => (
              <option key={cat} value={cat}>
                {CATEGORY_LABELS[cat]}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="challengemodal-field-6" className="field-label">
            Metric {!isEditing && <span className="text-rose-300" aria-hidden="true">*</span>}
          </label>
          <select
            id="challengemodal-field-6"
            disabled={isEditing}
            value={metricType}
            onChange={(e) => setMetricType(e.target.value as ChallengeMetricType)}
            className="input"
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
          <label htmlFor="challengemodal-field-7" className="field-label">
            Target Value <span className="text-rose-300" aria-hidden="true">*</span>
          </label>
          <input
            id="challengemodal-field-7"
            type="number"
            min={1}
            step="any"
            required
            value={targetValue}
            onChange={(e) => setTargetValue(parseFloat(e.target.value) || 0)}
            placeholder="e.g. 5"
            className="input"
          />
          <p className="field-hint">
            Units correspond to chosen metric (e.g., workouts, minutes, kg).
          </p>
        </div>

        <div>
          <label htmlFor="challengemodal-field-8" className="field-label">
            Reward Points <span className="text-rose-300" aria-hidden="true">*</span>
          </label>
          <input
            id="challengemodal-field-8"
            type="number"
            min={0}
            step={5}
            required
            value={rewardPoints}
            onChange={(e) => setRewardPoints(parseInt(e.target.value, 10) || 0)}
            placeholder="e.g. 50"
            className="input"
          />
          <p className="field-hint">
            OnusFit points awarded to the member upon completion.
          </p>
        </div>
      </div>

      {/* Badge ID */}
      <div>
        <label htmlFor="challengemodal-field-9" className="field-label">
          Reward Badge ID <span className="font-normal text-ink-500">(optional)</span>
        </label>
        <input
            id="challengemodal-field-9"
          type="text"
          value={rewardBadgeId}
          onChange={(e) => setRewardBadgeId(e.target.value)}
          placeholder="e.g. badge_warrior_gold"
          className="input font-mono"
        />
      </div>

      {/* Visual customization & Auto Enroll */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5 pt-1">
        <div>
          <label htmlFor="challengemodal-field-10" className="field-label">Icon Name</label>
          <input
            id="challengemodal-field-10"
            type="text"
            value={iconName}
            onChange={(e) => setIconName(e.target.value)}
            placeholder="trophy"
            className="input"
          />
        </div>

        <div>
          <label htmlFor="challengemodal-field-11" className="field-label">Banner Color</label>
          <input
            id="challengemodal-field-11"
            type="text"
            value={bannerColor}
            onChange={(e) => setBannerColor(e.target.value)}
            placeholder="teal"
            className="input"
          />
        </div>

        <div className="flex flex-col justify-end">
          <label className="flex items-center gap-2 cursor-pointer py-2">
            <input
              type="checkbox"
              checked={autoEnroll}
              onChange={(e) => setAutoEnroll(e.target.checked)}
              className="h-4 w-4 rounded"
            />
            <span className="text-[13px] font-medium text-ink-200">Auto-enroll users</span>
          </label>
        </div>
      </div>

      {/* Footer actions */}
      <div className="form-actions">
        <button
          type="button"
          onClick={onClose}
          disabled={isSubmitting}
          className="btn btn-secondary"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={isSubmitting}
          className="btn btn-primary"
        >
          {isSubmitting ? (
            <span>Saving…</span>
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
