'use client';

import React, { useState } from 'react';
import { Dumbbell, Layers, Activity, Flame, Plus } from 'lucide-react';
import { AdminLayout } from '@/components/layout/AdminLayout';
import { StatsCard } from '@/components/ui/StatsCard';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { TabBar } from '@/components/ui/TabBar';
import { useToast } from '@/context/ToastContext';
import { ExerciseFilterBar } from './ExerciseFilterBar';
import { ExercisesTable } from './ExercisesTable';
import { ExerciseModal } from './ExerciseModal';
import { WorkoutTemplatesTable } from './WorkoutTemplatesTable';
import { WorkoutTemplateModal } from './WorkoutTemplateModal';
import { useExercises } from '../hooks/useExercises';
import { useWorkoutTemplates } from '../hooks/useWorkoutTemplates';
import { useWorkoutStats } from '../hooks/useWorkoutStats';
import { workoutsApi } from '../api';
import type { Exercise, WorkoutTemplate, CreateExerciseInput, UpdateExerciseInput, CreateTemplateInput, UpdateTemplateInput } from '../types';

export function WorkoutsAdminView() {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState<'exercises' | 'templates'>('exercises');

  // Stats Hook
  const { stats, refresh: refreshStats } = useWorkoutStats();

  // Exercises Hook
  const {
    exercises,
    meta: exercisesMeta,
    search,
    setSearch,
    muscle,
    setMuscle,
    category,
    setCategory,
    equipment,
    setEquipment,
    difficulty,
    setDifficulty,
    setPage: setExercisePage,
    limit: exerciseLimit,
    setLimit: setExerciseLimit,
    isLoading: isLoadingExercises,
    isRefreshing: isRefreshingExercises,
    error: exercisesError,
    refresh: refreshExercises,
    fetchExercises,
  } = useExercises();

  // Templates Hook
  const {
    templates,
    meta: templatesMeta,
    setPage: setTemplatePage,
    limit: templateLimit,
    setLimit: setTemplateLimit,
    isLoading: isLoadingTemplates,
    isRefreshing: isRefreshingTemplates,
    error: templatesError,
    refresh: refreshTemplates,
  } = useWorkoutTemplates();

  // Exercise Modals State
  const [isExerciseModalOpen, setIsExerciseModalOpen] = useState(false);
  const [selectedExercise, setSelectedExercise] = useState<Exercise | null>(null);
  const [exerciseToDelete, setExerciseToDelete] = useState<Exercise | null>(null);
  const [isDeletingExercise, setIsDeletingExercise] = useState(false);

  // Template Modals State
  const [isTemplateModalOpen, setIsTemplateModalOpen] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<WorkoutTemplate | null>(null);
  const [templateToDelete, setTemplateToDelete] = useState<WorkoutTemplate | null>(null);
  const [isDeletingTemplate, setIsDeletingTemplate] = useState(false);

  const handleRefreshAll = async () => {
    await Promise.all([refreshStats(), refreshExercises(), refreshTemplates()]);
  };

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setExercisePage(1);
    fetchExercises();
  };

  // Exercise Actions
  const handleOpenCreateExercise = () => {
    setSelectedExercise(null);
    setIsExerciseModalOpen(true);
  };

  const handleOpenEditExercise = (exercise: Exercise) => {
    setSelectedExercise(exercise);
    setIsExerciseModalOpen(true);
  };

  const handleSubmitExercise = async (data: CreateExerciseInput | UpdateExerciseInput) => {
    try {
      if (selectedExercise) {
        await workoutsApi.updateExercise(selectedExercise.id, data as UpdateExerciseInput);
        toast.success(`Exercise "${data.name}" updated successfully.`);
      } else {
        await workoutsApi.createExercise(data as CreateExerciseInput);
        toast.success(`Exercise "${data.name}" created successfully.`);
      }
      await refreshExercises();
      await refreshStats();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to save exercise.';
      toast.error(msg);
      throw err;
    }
  };

  const handleOpenDeleteExercise = (exercise: Exercise) => {
    if (exercise.isSystem && /^e0000000-0000-4000-8000-0000000000(0[1-9]|1[0-4])$/.test(exercise.id)) {
      toast.error('The 14 foundational system exercises are protected and cannot be deleted.');
      return;
    }
    setExerciseToDelete(exercise);
  };

  const handleDeleteExerciseConfirm = async () => {
    if (!exerciseToDelete) return;
    if (exerciseToDelete.isSystem && /^e0000000-0000-4000-8000-0000000000(0[1-9]|1[0-4])$/.test(exerciseToDelete.id)) {
      toast.error('The 14 foundational system exercises are protected and cannot be deleted.');
      setExerciseToDelete(null);
      return;
    }
    setIsDeletingExercise(true);
    try {
      await workoutsApi.deleteExercise(exerciseToDelete.id);
      toast.success(`Exercise "${exerciseToDelete.name}" deleted.`);
      setExerciseToDelete(null);
      await refreshExercises();
      await refreshStats();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to delete exercise.';
      toast.error(msg);
    } finally {
      setIsDeletingExercise(false);
    }
  };

  // Template Actions
  const handleOpenCreateTemplate = () => {
    setSelectedTemplate(null);
    setIsTemplateModalOpen(true);
  };

  const handleOpenEditTemplate = (template: WorkoutTemplate) => {
    setSelectedTemplate(template);
    setIsTemplateModalOpen(true);
  };

  const handleSubmitTemplate = async (data: CreateTemplateInput | UpdateTemplateInput) => {
    try {
      if (selectedTemplate) {
        await workoutsApi.updateTemplate(selectedTemplate.id, data as UpdateTemplateInput);
        toast.success(`Template "${data.name}" updated successfully.`);
      } else {
        await workoutsApi.createTemplate(data as CreateTemplateInput);
        toast.success(`Template "${data.name}" created successfully.`);
      }
      await refreshTemplates();
      await refreshStats();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to save template.';
      toast.error(msg);
      throw err;
    }
  };

  const handleDeleteTemplateConfirm = async () => {
    if (!templateToDelete) return;
    setIsDeletingTemplate(true);
    try {
      await workoutsApi.deleteTemplate(templateToDelete.id);
      toast.success(`Template "${templateToDelete.name}" deleted.`);
      setTemplateToDelete(null);
      await refreshTemplates();
      await refreshStats();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to delete template.';
      toast.error(msg);
    } finally {
      setIsDeletingTemplate(false);
    }
  };

  const formatVolume = (kg: number) => {
    if (kg >= 1000) {
      return `${(kg / 1000).toFixed(1)} t`;
    }
    return `${kg.toLocaleString()} kg`;
  };

  return (
    <AdminLayout
      title="Workouts"
      subtitle="Manage the global exercise library and system-curated starter routines."
      onRefresh={handleRefreshAll}
      isRefreshing={isRefreshingExercises || isRefreshingTemplates}
    >
      <div className="space-y-6">
        <section aria-label="Workout metrics" className="grid grid-cols-1 gap-3 min-[420px]:grid-cols-2 xl:grid-cols-4 sm:gap-4">
          <StatsCard
            title="Exercise library"
            value={stats ? stats.totalExercises : '—'}
            subtitle="Global library exercises"
            icon={<Dumbbell />}
            accent="teal"
          />
          <StatsCard
            title="Curated routines"
            value={stats ? (stats.totalSystemTemplates ?? stats.totalTemplates ?? 0) : '—'}
            subtitle="Verified starter templates"
            icon={<Layers />}
            accent="emerald"
          />
          <StatsCard
            title="Sessions completed"
            value={stats ? (stats.totalCompletedSessions ?? stats.totalSessions ?? 0).toLocaleString() : '—'}
            subtitle="Total member logs"
            icon={<Activity />}
            accent="purple"
          />
          <StatsCard
            title="Volume lifted"
            value={stats ? formatVolume(stats.totalVolumeLiftedKg ?? stats.totalVolumeKg ?? 0) : '—'}
            subtitle={stats ? `${stats.activeLiftersCount ?? 0} active lifters` : 'Cumulative weight moved'}
            icon={<Flame />}
            accent="amber"
          />
        </section>

        <div className="space-y-4">
          <TabBar
            ariaLabel="Workout content"
            active={activeTab}
            onChange={setActiveTab}
            tabs={[
              { id: 'exercises', label: 'Exercise library', icon: <Dumbbell />, count: exercisesMeta.total },
              { id: 'templates', label: 'Curated routines', icon: <Layers />, count: templatesMeta.total },
            ]}
          />

          {activeTab === 'exercises' && (
            <div className="space-y-4">
              <ExerciseFilterBar
                search={search}
                onSearchChange={setSearch}
                muscle={muscle}
                onMuscleChange={setMuscle}
                category={category}
                onCategoryChange={setCategory}
                equipment={equipment}
                onEquipmentChange={setEquipment}
                difficulty={difficulty}
                onDifficultyChange={setDifficulty}
                onSubmit={handleSearchSubmit}
                onOpenCreateModal={handleOpenCreateExercise}
              />

              <ExercisesTable
                exercises={exercises}
                isLoading={isLoadingExercises}
                error={exercisesError}
                meta={exercisesMeta}
                limit={exerciseLimit}
                onLimitChange={(l) => {
                  setExerciseLimit(l);
                  setExercisePage(1);
                }}
                onPageChange={setExercisePage}
                onEditExercise={handleOpenEditExercise}
                onDeleteExercise={handleOpenDeleteExercise}
              />
            </div>
          )}

          {activeTab === 'templates' && (
            <div className="space-y-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-[13px] text-ink-400">
                  Starter routines offered to new members during onboarding.
                </p>
                <button type="button" onClick={handleOpenCreateTemplate} className="btn btn-primary">
                  <Plus className="h-4 w-4" />
                  New routine
                </button>
              </div>

              <WorkoutTemplatesTable
                templates={templates}
                isLoading={isLoadingTemplates}
                error={templatesError}
                meta={templatesMeta}
                limit={templateLimit}
                onLimitChange={(l) => {
                  setTemplateLimit(l);
                  setTemplatePage(1);
                }}
                onPageChange={setTemplatePage}
                onEditTemplate={handleOpenEditTemplate}
                onDeleteTemplate={setTemplateToDelete}
                onOpenCreateModal={handleOpenCreateTemplate}
              />
            </div>
          )}
        </div>

        <ExerciseModal
          isOpen={isExerciseModalOpen}
          onClose={() => setIsExerciseModalOpen(false)}
          exercise={selectedExercise}
          onSubmit={handleSubmitExercise}
        />

        <WorkoutTemplateModal
          isOpen={isTemplateModalOpen}
          onClose={() => setIsTemplateModalOpen(false)}
          template={selectedTemplate}
          availableExercises={exercises}
          onSubmit={handleSubmitTemplate}
        />

        {exerciseToDelete && (
          <ConfirmDialog
            isOpen={Boolean(exerciseToDelete)}
            onClose={() => setExerciseToDelete(null)}
            onConfirm={handleDeleteExerciseConfirm}
            isBusy={isDeletingExercise}
            title="Delete exercise?"
            description="This removes the exercise from the catalog."
            confirmLabel="Delete exercise"
            busyLabel="Deleting…"
          >
            Deleting <strong className="font-semibold text-white">{exerciseToDelete.name}</strong> will
            soft-delete it. Existing workout logs referencing this exercise keep their historical
            volume data.
          </ConfirmDialog>
        )}

        {templateToDelete && (
          <ConfirmDialog
            isOpen={Boolean(templateToDelete)}
            onClose={() => setTemplateToDelete(null)}
            onConfirm={handleDeleteTemplateConfirm}
            isBusy={isDeletingTemplate}
            title="Delete routine?"
            description="This removes the curated starter routine."
            confirmLabel="Delete routine"
            busyLabel="Deleting…"
          >
            Deleting <strong className="font-semibold text-white">{templateToDelete.name}</strong> removes
            it from new members&apos; starter lists. Members who already logged or cloned this routine
            keep their copies.
          </ConfirmDialog>
        )}
      </div>
    </AdminLayout>
  );
}
