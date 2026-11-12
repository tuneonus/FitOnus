'use client';

import React, { useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Plus, Trash2, ArrowUp, ArrowDown } from 'lucide-react';
import type {
  WorkoutTemplate,
  CreateTemplateInput,
  UpdateTemplateInput,
  Exercise,
  TemplateExerciseInput,
} from '../types';

interface WorkoutTemplateModalProps {
  isOpen: boolean;
  onClose: () => void;
  template: WorkoutTemplate | null; // null for Create, non-null for Edit
  availableExercises: Exercise[];
  onSubmit: (data: CreateTemplateInput | UpdateTemplateInput) => Promise<void>;
}

function TemplateForm({
  template,
  availableExercises,
  onClose,
  onSubmit,
}: {
  template: WorkoutTemplate | null;
  availableExercises: Exercise[];
  onClose: () => void;
  onSubmit: (data: CreateTemplateInput | UpdateTemplateInput) => Promise<void>;
}) {
  const isEditing = Boolean(template);

  const [name, setName] = useState(template?.name || '');
  const [description, setDescription] = useState(template?.description || '');
  const [difficulty, setDifficulty] = useState<WorkoutTemplate['difficulty']>(template?.difficulty || 'intermediate');
  const [estimatedDurationMinutes, setEstimatedDurationMinutes] = useState<number | ''>(
    template?.estimatedDurationMinutes || 45
  );
  const [tags, setTags] = useState(template?.tags.join(', ') || '');
  const [exercises, setExercises] = useState<TemplateExerciseInput[]>(
    template
      ? template.exercises.map((e, idx) => ({
          exerciseId: e.exerciseId,
          orderIndex: idx,
          targetSets: e.targetSets,
          targetReps: e.targetReps,
          targetRpe: e.targetRpe ?? null,
          restSeconds: e.restSeconds ?? 60,
          notes: e.notes || null,
        }))
      : []
  );

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleAddExerciseRow = () => {
    if (availableExercises.length === 0) return;
    const defaultEx = availableExercises[0];
    setExercises((prev) => [
      ...prev,
      {
        exerciseId: defaultEx.id,
        orderIndex: prev.length,
        targetSets: 3,
        targetReps: '10',
        targetRpe: null,
        restSeconds: 60,
        notes: null,
      },
    ]);
  };

  const handleRemoveExerciseRow = (index: number) => {
    setExercises((prev) => {
      const updated = prev.filter((_, i) => i !== index);
      return updated.map((e, i) => ({ ...e, orderIndex: i }));
    });
  };

  const handleMoveExercise = (index: number, direction: 'up' | 'down') => {
    if (
      (direction === 'up' && index === 0) ||
      (direction === 'down' && index === exercises.length - 1)
    ) {
      return;
    }
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    const updated = [...exercises];
    const temp = updated[index];
    updated[index] = updated[targetIndex];
    updated[targetIndex] = temp;
    setExercises(updated.map((e, i) => ({ ...e, orderIndex: i })));
  };

  const handleExerciseChange = <K extends keyof TemplateExerciseInput>(
    index: number,
    field: K,
    value: TemplateExerciseInput[K]
  ) => {
    setExercises((prev) =>
      prev.map((e, i) => (i === index ? { ...e, [field]: value } : e))
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError('Routine name is required.');
      return;
    }
    if (exercises.length === 0) {
      setError('At least one exercise must be configured in the routine.');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const parsedTags = tags
        .split(',')
        .map((t) => t.trim().toLowerCase())
        .filter(Boolean);

      const payload = {
        name: name.trim(),
        description: description.trim() || null,
        difficulty,
        estimatedDurationMinutes:
          typeof estimatedDurationMinutes === 'number' && estimatedDurationMinutes > 0
            ? estimatedDurationMinutes
            : null,
        tags: parsedTags,
        exercises: exercises.map((e, idx) => ({
          exerciseId: e.exerciseId,
          orderIndex: idx,
          targetSets: Number(e.targetSets) || 3,
          targetReps: String(e.targetReps || '10'),
          targetRpe: e.targetRpe ? Number(e.targetRpe) : null,
          restSeconds: e.restSeconds ? Number(e.restSeconds) : 60,
          notes: e.notes ? String(e.notes).trim() : null,
        })),
      };

      await onSubmit(payload);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save workout routine.');
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

      {/* Row 1: Name, Difficulty, Duration */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div className="md:col-span-2">
          <label htmlFor="workouttemplatemodal-field-1" className="field-label">
            Routine Name *
          </label>
          <input
            id="workouttemplatemodal-field-1"
            type="text"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Push Hypertrophy Foundation"
            className="input"
          />
        </div>

        <div>
          <label htmlFor="workouttemplatemodal-field-2" className="field-label">
            Difficulty
          </label>
          <select
            id="workouttemplatemodal-field-2"
            value={difficulty}
            onChange={(e) => setDifficulty(e.target.value as WorkoutTemplate['difficulty'])}
            className="input"
          >
            <option value="beginner">Beginner</option>
            <option value="intermediate">Intermediate</option>
            <option value="advanced">Advanced</option>
          </select>
        </div>
      </div>

      {/* Row 2: Duration, Tags */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div>
          <label htmlFor="workouttemplatemodal-field-3" className="field-label">
            Est. Duration (Minutes)
          </label>
          <input
            id="workouttemplatemodal-field-3"
            type="number"
            min={5}
            max={240}
            value={estimatedDurationMinutes}
            onChange={(e) =>
              setEstimatedDurationMinutes(e.target.value === '' ? '' : Number(e.target.value))
            }
            placeholder="45"
            className="input"
          />
        </div>

        <div className="md:col-span-2">
          <label htmlFor="workouttemplatemodal-field-4" className="field-label">
            Tags (comma separated)
          </label>
          <input
            id="workouttemplatemodal-field-4"
            type="text"
            value={tags}
            onChange={(e) => setTags(e.target.value)}
            placeholder="e.g. push, chest, upper, hypertrophy"
            className="input"
          />
        </div>
      </div>

      {/* Row 3: Description */}
      <div>
        <label htmlFor="workouttemplatemodal-field-5" className="field-label">
          Routine Overview
        </label>
        <textarea
            id="workouttemplatemodal-field-5"
          rows={2}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Focuses on chest, shoulders, and triceps with progressive compound overload."
          className="input"
        />
      </div>

      {/* Exercises Config List */}
      <div>
        <div className="flex items-center justify-between border-b border-ink-800 pb-2">
          <h3 className="eyebrow">
            Exercises ({exercises.length})
          </h3>
          <button
            type="button"
            onClick={handleAddExerciseRow}
            className="btn btn-secondary btn-sm"
          >
            <Plus className="h-3.5 w-3.5" />
            Add exercise
          </button>
        </div>

        <div className="mt-3 space-y-2 max-h-72 overflow-y-auto pr-1">
          {exercises.length === 0 ? (
            <div className="rounded-lg border border-dashed border-ink-700 py-6 text-center text-xs text-ink-400">
              No exercises added yet. Click &quot;Add Exercise&quot; above to build the routine.
            </div>
          ) : (
            exercises.map((item, idx) => (
              <div
                key={idx}
                className="card-inset flex flex-wrap items-center gap-2 p-2.5"
              >
                {/* Reorder Buttons */}
                <div className="flex flex-col gap-0.5">
                  <button
                    type="button"
                    disabled={idx === 0}
                    onClick={() => handleMoveExercise(idx, 'up')}
                    aria-label={`Move exercise ${idx + 1} up`}
                    className="rounded p-0.5 text-ink-500 hover:bg-ink-800 hover:text-white disabled:opacity-20"
                  >
                    <ArrowUp className="h-3 w-3" />
                  </button>
                  <button
                    type="button"
                    disabled={idx === exercises.length - 1}
                    onClick={() => handleMoveExercise(idx, 'down')}
                    aria-label={`Move exercise ${idx + 1} down`}
                    className="rounded p-0.5 text-ink-500 hover:bg-ink-800 hover:text-white disabled:opacity-20"
                  >
                    <ArrowDown className="h-3 w-3" />
                  </button>
                </div>

                {/* Exercise Select */}
                <div className="min-w-[160px] flex-1">
                  <select
                    value={item.exerciseId}
                    onChange={(e) => handleExerciseChange(idx, 'exerciseId', e.target.value)}
                    aria-label={`Exercise ${idx + 1}`}
                    className="input"
                  >
                    {availableExercises.map((ae) => (
                      <option key={ae.id} value={ae.id}>
                        {ae.name} ({ae.equipment})
                      </option>
                    ))}
                  </select>
                </div>

                {/* Sets */}
                <div className="w-16" title="Sets">
                  <input
                    type="number"
                    min={1}
                    max={20}
                    placeholder="Sets"
                    value={item.targetSets}
                    onChange={(e) =>
                      handleExerciseChange(idx, 'targetSets', Number(e.target.value))
                    }
                    aria-label={`Sets for exercise ${idx + 1}`}
                    className="input px-2"
                  />
                </div>

                {/* Reps */}
                <div className="w-20" title="Reps">
                  <input
                    type="text"
                    placeholder="Reps (8-12)"
                    value={item.targetReps}
                    onChange={(e) => handleExerciseChange(idx, 'targetReps', e.target.value)}
                    aria-label={`Reps for exercise ${idx + 1}`}
                    className="input px-2"
                  />
                </div>

                {/* Rest (sec) */}
                <div className="w-20" title="Rest (seconds)">
                  <input
                    type="number"
                    min={0}
                    max={600}
                    step={15}
                    placeholder="Rest (s)"
                    value={item.restSeconds ?? 60}
                    onChange={(e) =>
                      handleExerciseChange(idx, 'restSeconds', Number(e.target.value))
                    }
                    aria-label={`Rest seconds for exercise ${idx + 1}`}
                    className="input px-2"
                  />
                </div>

                {/* Remove */}
                <button
                  type="button"
                  onClick={() => handleRemoveExerciseRow(idx)}
                  aria-label={`Remove exercise ${idx + 1}`}
                  className="btn btn-danger-ghost btn-icon btn-sm ml-auto"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))
          )}
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
          {isSubmitting ? 'Saving…' : isEditing ? 'Update Routine' : 'Create Routine'}
        </button>
      </div>
    </form>
  );
}

export function WorkoutTemplateModal({
  isOpen,
  onClose,
  template,
  availableExercises,
  onSubmit,
}: WorkoutTemplateModalProps) {
  const isEditing = Boolean(template);

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={isEditing ? 'Edit starter routine' : 'New starter routine'}
      description="System-curated routines are published globally for all members as verified starter templates."
      maxWidth="2xl"
    >
      <TemplateForm
        key={template?.id || 'new'}
        template={template}
        availableExercises={availableExercises}
        onClose={onClose}
        onSubmit={onSubmit}
      />
    </Modal>
  );
}
