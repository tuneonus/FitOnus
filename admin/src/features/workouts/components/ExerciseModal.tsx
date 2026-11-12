'use client';

import React, { useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import type { Exercise, CreateExerciseInput, UpdateExerciseInput } from '../types';

interface ExerciseModalProps {
  isOpen: boolean;
  onClose: () => void;
  exercise: Exercise | null; // null for Create, non-null for Edit
  onSubmit: (data: CreateExerciseInput | UpdateExerciseInput) => Promise<void>;
}

function ExerciseForm({
  exercise,
  onClose,
  onSubmit,
}: {
  exercise: Exercise | null;
  onClose: () => void;
  onSubmit: (data: CreateExerciseInput | UpdateExerciseInput) => Promise<void>;
}) {
  const isEditing = Boolean(exercise);

  const [name, setName] = useState(exercise?.name || '');
  const [description, setDescription] = useState(exercise?.description || '');
  const [category, setCategory] = useState<string>(exercise?.category || 'strength');
  const [primaryMuscles, setPrimaryMuscles] = useState(
    exercise?.primaryMuscles?.join(', ') || exercise?.primaryMuscle || 'Chest'
  );
  const [secondaryMuscles, setSecondaryMuscles] = useState(
    exercise?.secondaryMuscles?.join(', ') || ''
  );
  const [equipment, setEquipment] = useState(exercise?.equipment || 'Barbell');
  const [difficulty, setDifficulty] = useState<Exercise['difficulty']>(
    exercise?.difficulty || 'intermediate'
  );
  const [isCompound, setIsCompound] = useState<boolean>(exercise?.isCompound ?? false);
  const [instructions, setInstructions] = useState(exercise?.instructions?.join('\n') || '');
  const [tips, setTips] = useState(exercise?.tips?.join('\n') || '');
  const [commonMistakes, setCommonMistakes] = useState(
    exercise?.commonMistakes?.join('\n') || ''
  );
  const [videoUrl, setVideoUrl] = useState(exercise?.videoUrl || '');
  const [imageUrl, setImageUrl] = useState(exercise?.imageUrl || '');

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isValidUrl = (url: string) => {
    try {
      const parsed = new URL(url);
      return parsed.protocol === 'http:' || parsed.protocol === 'https:';
    } catch {
      return false;
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError('Exercise name is required.');
      return;
    }

    const parsedPrimary = primaryMuscles
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);

    if (parsedPrimary.length === 0) {
      setError('At least one primary muscle is required.');
      return;
    }

    const parsedInstructions = instructions
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean);

    if (parsedInstructions.length === 0) {
      setError('At least one instruction step is required.');
      return;
    }

    if (videoUrl.trim() && !isValidUrl(videoUrl.trim())) {
      setError('Video URL must be a valid http or https URL.');
      return;
    }

    if (imageUrl.trim() && !isValidUrl(imageUrl.trim())) {
      setError('Image URL must be a valid http or https URL.');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const parsedSecondary = secondaryMuscles
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);

      const parsedTips = tips
        .split('\n')
        .map((s) => s.trim())
        .filter(Boolean);

      const parsedMistakes = commonMistakes
        .split('\n')
        .map((s) => s.trim())
        .filter(Boolean);

      const payload: CreateExerciseInput = {
        name: name.trim(),
        description: description.trim() || null,
        category: category.trim(),
        primaryMuscles: parsedPrimary,
        primaryMuscle: parsedPrimary[0],
        secondaryMuscles: parsedSecondary,
        equipment: equipment.trim(),
        difficulty,
        isCompound,
        instructions: parsedInstructions,
        tips: parsedTips,
        commonMistakes: parsedMistakes,
        videoUrl: videoUrl.trim() || null,
        imageUrl: imageUrl.trim() || null,
      };

      await onSubmit(payload);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save exercise.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && (
        <div className="alert alert-error">
          {error}
        </div>
      )}

      {/* Row 1: Name & Category */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label htmlFor="exercisemodal-field-1" className="field-label">
            Exercise Name *
          </label>
          <input
            id="exercisemodal-field-1"
            type="text"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Barbell Bench Press"
            className="input"
          />
        </div>

        <div>
          <label htmlFor="exercisemodal-field-2" className="field-label">
            Category
          </label>
          <select
            id="exercisemodal-field-2"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="input"
          >
            <option value="strength">Strength</option>
            <option value="hypertrophy">Hypertrophy</option>
            <option value="endurance">Endurance</option>
            <option value="mobility">Mobility</option>
            <option value="cardio">Cardio</option>
          </select>
        </div>
      </div>

      {/* Row 2: Primary Muscles, Secondary Muscles, Equipment, Difficulty */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
        <div>
          <label htmlFor="exercisemodal-field-3" className="field-label">
            Primary Muscles *
          </label>
          <input
            id="exercisemodal-field-3"
            type="text"
            required
            value={primaryMuscles}
            onChange={(e) => setPrimaryMuscles(e.target.value)}
            placeholder="e.g. Chest, Triceps"
            className="input"
          />
        </div>

        <div>
          <label htmlFor="exercisemodal-field-4" className="field-label">
            Secondary Muscles
          </label>
          <input
            id="exercisemodal-field-4"
            type="text"
            value={secondaryMuscles}
            onChange={(e) => setSecondaryMuscles(e.target.value)}
            placeholder="e.g. Shoulders, Abs"
            className="input"
          />
        </div>

        <div>
          <label htmlFor="exercisemodal-field-5" className="field-label">
            Equipment
          </label>
          <input
            id="exercisemodal-field-5"
            type="text"
            required
            value={equipment}
            onChange={(e) => setEquipment(e.target.value)}
            placeholder="Barbell, Dumbbell, etc."
            className="input"
          />
        </div>

        <div>
          <label htmlFor="exercisemodal-field-6" className="field-label">
            Difficulty
          </label>
          <select
            id="exercisemodal-field-6"
            value={difficulty}
            onChange={(e) => setDifficulty(e.target.value as Exercise['difficulty'])}
            className="input"
          >
            <option value="beginner">Beginner</option>
            <option value="intermediate">Intermediate</option>
            <option value="advanced">Advanced</option>
          </select>
        </div>
      </div>

      {/* Row 3: Compound Movement Toggle & Description */}
      <div className="flex items-center gap-3 py-1">
        <label className="relative inline-flex items-center cursor-pointer">
          <input
            type="checkbox"
            checked={isCompound}
            onChange={(e) => setIsCompound(e.target.checked)}
            className="sr-only peer"
          />
          <div className="w-9 h-5 bg-ink-800 ring-1 ring-inset ring-ink-700 peer-focus-visible:ring-2 peer-focus-visible:ring-brand-500/60 peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-ink-900 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-ink-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-brand-500"></div>
          <span className="ml-2.5 text-xs font-medium text-ink-300">
            Compound Movement (engages multiple joint groups)
          </span>
        </label>
      </div>

      <div>
        <label htmlFor="exercisemodal-field-7" className="field-label">
          Description
        </label>
        <textarea
            id="exercisemodal-field-7"
          rows={2}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Brief overview of the exercise and primary stimulus..."
          className="input"
        />
      </div>

      {/* Row 4: Instructions, Tips & Common Mistakes */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div>
          <label htmlFor="exercisemodal-field-8" className="field-label">
            Instructions * (one per line)
          </label>
          <textarea
            id="exercisemodal-field-8"
            rows={4}
            value={instructions}
            onChange={(e) => setInstructions(e.target.value)}
            placeholder="1. Lie flat on bench&#10;2. Grip barbell with medium width&#10;3. Lower bar smoothly to chest"
            className="input font-mono"
          />
        </div>

        <div>
          <label htmlFor="exercisemodal-field-9" className="field-label">
            Form Tips & Cues (one per line)
          </label>
          <textarea
            id="exercisemodal-field-9"
            rows={4}
            value={tips}
            onChange={(e) => setTips(e.target.value)}
            placeholder="Keep feet planted firmly&#10;Maintain slight arch in lower back&#10;Do not bounce bar off ribcage"
            className="input font-mono"
          />
        </div>

        <div>
          <label htmlFor="exercisemodal-field-10" className="field-label">
            Common Mistakes (one per line)
          </label>
          <textarea
            id="exercisemodal-field-10"
            rows={4}
            value={commonMistakes}
            onChange={(e) => setCommonMistakes(e.target.value)}
            placeholder="Flaring elbows outward&#10;Lifting hips off the bench&#10;Incomplete lockout"
            className="input font-mono"
          />
        </div>
      </div>

      {/* Row 5: Media URLs (Optional) */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label htmlFor="exercisemodal-field-11" className="field-label">
            Video Demonstration URL (optional)
          </label>
          <input
            id="exercisemodal-field-11"
            type="url"
            value={videoUrl}
            onChange={(e) => setVideoUrl(e.target.value)}
            placeholder="https://..."
            className="input"
          />
        </div>

        <div>
          <label htmlFor="exercisemodal-field-12" className="field-label">
            Thumbnail / Image URL (optional)
          </label>
          <input
            id="exercisemodal-field-12"
            type="url"
            value={imageUrl}
            onChange={(e) => setImageUrl(e.target.value)}
            placeholder="https://..."
            className="input"
          />
        </div>
      </div>

      {/* Footer Actions */}
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
          {isSubmitting ? 'Saving…' : isEditing ? 'Update Exercise' : 'Create Exercise'}
        </button>
      </div>
    </form>
  );
}

export function ExerciseModal({
  isOpen,
  onClose,
  exercise,
  onSubmit,
}: ExerciseModalProps) {
  const isEditing = Boolean(exercise);

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={isEditing ? 'Edit exercise' : 'Add exercise'}
      description={
        isEditing
          ? 'Modify verified exercise details in the global OnusFit library.'
          : 'Add a new verified exercise to the global library with form cues and targets.'
      }
      maxWidth="2xl"
    >
      <ExerciseForm
        key={exercise?.id || 'new'}
        exercise={exercise}
        onClose={onClose}
        onSubmit={onSubmit}
      />
    </Modal>
  );
}
