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
  const [category, setCategory] = useState<Exercise['category']>(exercise?.category || 'strength');
  const [primaryMuscle, setPrimaryMuscle] = useState(exercise?.primaryMuscle || 'chest');
  const [secondaryMuscles, setSecondaryMuscles] = useState(exercise?.secondaryMuscles.join(', ') || '');
  const [equipment, setEquipment] = useState(exercise?.equipment || 'barbell');
  const [difficulty, setDifficulty] = useState<Exercise['difficulty']>(exercise?.difficulty || 'intermediate');
  const [instructions, setInstructions] = useState(exercise?.instructions.join('\n') || '');
  const [tips, setTips] = useState(exercise?.tips.join('\n') || '');
  const [videoUrl, setVideoUrl] = useState(exercise?.videoUrl || '');
  const [imageUrl, setImageUrl] = useState(exercise?.imageUrl || '');

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError('Exercise name is required.');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const parsedSecondary = secondaryMuscles
        .split(',')
        .map((s) => s.trim().toLowerCase())
        .filter(Boolean);

      const parsedInstructions = instructions
        .split('\n')
        .map((s) => s.trim())
        .filter(Boolean);

      const parsedTips = tips
        .split('\n')
        .map((s) => s.trim())
        .filter(Boolean);

      const payload = {
        name: name.trim(),
        description: description.trim() || null,
        category,
        primaryMuscle: primaryMuscle.trim().toLowerCase(),
        secondaryMuscles: parsedSecondary,
        equipment: equipment.trim().toLowerCase(),
        difficulty,
        instructions: parsedInstructions,
        tips: parsedTips,
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
        <div className="rounded-xl border border-rose-500/20 bg-rose-500/10 p-3 text-xs text-rose-400">
          {error}
        </div>
      )}

      {/* Row 1: Name & Category */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-semibold text-slate-300 mb-1.5">
            Exercise Name *
          </label>
          <input
            type="text"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Barbell Bench Press"
            className="w-full rounded-xl border border-slate-800 bg-slate-950 px-3.5 py-2 text-xs text-white placeholder-slate-500 focus:border-teal-500 focus:outline-none"
          />
        </div>

        <div>
          <label className="block text-xs font-semibold text-slate-300 mb-1.5">
            Category
          </label>
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value as Exercise['category'])}
            className="w-full rounded-xl border border-slate-800 bg-slate-950 px-3.5 py-2 text-xs text-white focus:border-teal-500 focus:outline-none"
          >
            <option value="strength">Strength</option>
            <option value="hypertrophy">Hypertrophy</option>
            <option value="endurance">Endurance</option>
            <option value="mobility">Mobility</option>
            <option value="cardio">Cardio</option>
          </select>
        </div>
      </div>

      {/* Row 2: Primary Muscle, Secondary Muscles, Equipment, Difficulty */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
        <div>
          <label className="block text-xs font-semibold text-slate-300 mb-1.5">
            Primary Muscle *
          </label>
          <input
            type="text"
            required
            value={primaryMuscle}
            onChange={(e) => setPrimaryMuscle(e.target.value)}
            placeholder="e.g. chest"
            className="w-full rounded-xl border border-slate-800 bg-slate-950 px-3.5 py-2 text-xs text-white placeholder-slate-500 focus:border-teal-500 focus:outline-none"
          />
        </div>

        <div>
          <label className="block text-xs font-semibold text-slate-300 mb-1.5">
            Secondary Muscles
          </label>
          <input
            type="text"
            value={secondaryMuscles}
            onChange={(e) => setSecondaryMuscles(e.target.value)}
            placeholder="triceps, shoulders"
            className="w-full rounded-xl border border-slate-800 bg-slate-950 px-3.5 py-2 text-xs text-white placeholder-slate-500 focus:border-teal-500 focus:outline-none"
          />
        </div>

        <div>
          <label className="block text-xs font-semibold text-slate-300 mb-1.5">
            Equipment
          </label>
          <input
            type="text"
            required
            value={equipment}
            onChange={(e) => setEquipment(e.target.value)}
            placeholder="barbell, dumbbell"
            className="w-full rounded-xl border border-slate-800 bg-slate-950 px-3.5 py-2 text-xs text-white placeholder-slate-500 focus:border-teal-500 focus:outline-none"
          />
        </div>

        <div>
          <label className="block text-xs font-semibold text-slate-300 mb-1.5">
            Difficulty
          </label>
          <select
            value={difficulty}
            onChange={(e) => setDifficulty(e.target.value as Exercise['difficulty'])}
            className="w-full rounded-xl border border-slate-800 bg-slate-950 px-3.5 py-2 text-xs text-white focus:border-teal-500 focus:outline-none"
          >
            <option value="beginner">Beginner</option>
            <option value="intermediate">Intermediate</option>
            <option value="advanced">Advanced</option>
          </select>
        </div>
      </div>

      {/* Row 3: Description */}
      <div>
        <label className="block text-xs font-semibold text-slate-300 mb-1.5">
          Description
        </label>
        <textarea
          rows={2}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Brief overview of the exercise and primary stimulus..."
          className="w-full rounded-xl border border-slate-800 bg-slate-950 p-3 text-xs text-white placeholder-slate-500 focus:border-teal-500 focus:outline-none"
        />
      </div>

      {/* Row 4: Instructions & Tips */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-semibold text-slate-300 mb-1.5">
            Instructions (one step per line)
          </label>
          <textarea
            rows={4}
            value={instructions}
            onChange={(e) => setInstructions(e.target.value)}
            placeholder="1. Lie flat on bench&#10;2. Grip barbell with medium width&#10;3. Lower bar smoothly to mid-chest"
            className="w-full rounded-xl border border-slate-800 bg-slate-950 p-3 text-xs text-white placeholder-slate-500 focus:border-teal-500 focus:outline-none font-mono"
          />
        </div>

        <div>
          <label className="block text-xs font-semibold text-slate-300 mb-1.5">
            Form Tips & Cues (one per line)
          </label>
          <textarea
            rows={4}
            value={tips}
            onChange={(e) => setTips(e.target.value)}
            placeholder="Keep feet planted firmly&#10;Maintain slight arch in lower back&#10;Do not bounce bar off ribcage"
            className="w-full rounded-xl border border-slate-800 bg-slate-950 p-3 text-xs text-white placeholder-slate-500 focus:border-teal-500 focus:outline-none font-mono"
          />
        </div>
      </div>

      {/* Row 5: Media URLs (Optional) */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-semibold text-slate-300 mb-1.5">
            Video Demonstration URL (optional)
          </label>
          <input
            type="url"
            value={videoUrl}
            onChange={(e) => setVideoUrl(e.target.value)}
            placeholder="https://..."
            className="w-full rounded-xl border border-slate-800 bg-slate-950 px-3.5 py-2 text-xs text-white placeholder-slate-500 focus:border-teal-500 focus:outline-none"
          />
        </div>

        <div>
          <label className="block text-xs font-semibold text-slate-300 mb-1.5">
            Thumbnail / Image URL (optional)
          </label>
          <input
            type="url"
            value={imageUrl}
            onChange={(e) => setImageUrl(e.target.value)}
            placeholder="https://..."
            className="w-full rounded-xl border border-slate-800 bg-slate-950 px-3.5 py-2 text-xs text-white placeholder-slate-500 focus:border-teal-500 focus:outline-none"
          />
        </div>
      </div>

      {/* Footer Actions */}
      <div className="flex justify-end gap-3 pt-3 border-t border-slate-800">
        <button
          type="button"
          onClick={onClose}
          disabled={isSubmitting}
          className="rounded-xl border border-slate-800 bg-slate-900 px-4 py-2 text-xs font-medium text-slate-300 hover:bg-slate-800 transition-colors"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={isSubmitting}
          className="rounded-xl bg-teal-500 hover:bg-teal-400 px-4 py-2 text-xs font-semibold text-slate-950 shadow-md shadow-teal-500/20 transition-all disabled:opacity-50"
        >
          {isSubmitting ? 'Saving...' : isEditing ? 'Update Exercise' : 'Create Exercise'}
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
      title={isEditing ? 'Edit Exercise' : 'Add New Exercise'}
      description={
        isEditing
          ? 'Modify verified exercise details in the global FitOnus library.'
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
