'use client';

import React, { useState } from 'react';
import {
  Dumbbell,
  Layers,
  Activity,
  Flame,
  AlertTriangle,
} from 'lucide-react';
import { AdminLayout } from '@/components/layout/AdminLayout';
import { StatsCard } from '@/components/ui/StatsCard';
import { Modal } from '@/components/ui/Modal';
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
    if (selectedExercise) {
      await workoutsApi.updateExercise(selectedExercise.id, data as UpdateExerciseInput);
    } else {
      await workoutsApi.createExercise(data as CreateExerciseInput);
    }
    await refreshExercises();
    await refreshStats();
  };

  const handleDeleteExerciseConfirm = async () => {
    if (!exerciseToDelete) return;
    setIsDeletingExercise(true);
    try {
      await workoutsApi.deleteExercise(exerciseToDelete.id);
      setExerciseToDelete(null);
      await refreshExercises();
      await refreshStats();
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
    if (selectedTemplate) {
      await workoutsApi.updateTemplate(selectedTemplate.id, data as UpdateTemplateInput);
    } else {
      await workoutsApi.createTemplate(data as CreateTemplateInput);
    }
    await refreshTemplates();
    await refreshStats();
  };

  const handleDeleteTemplateConfirm = async () => {
    if (!templateToDelete) return;
    setIsDeletingTemplate(true);
    try {
      await workoutsApi.deleteTemplate(templateToDelete.id);
      setTemplateToDelete(null);
      await refreshTemplates();
      await refreshStats();
    } finally {
      setIsDeletingTemplate(false);
    }
  };

  const formatVolume = (kg: number) => {
    if (kg >= 1000) {
      return `${(kg / 1000).toFixed(1)} tons`;
    }
    return `${kg.toLocaleString()} kg`;
  };

  return (
    <AdminLayout
      title="Workouts & Exercises"
      subtitle="Manage global exercise catalog and system-curated starter workout routines"
      onRefresh={handleRefreshAll}
      isRefreshing={isRefreshingExercises || isRefreshingTemplates}
    >
      <div className="space-y-6">
        {/* KPI Stats Grid */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatsCard
            title="Exercise Catalog"
            value={stats ? stats.totalExercises : '—'}
            subtitle={stats ? `${stats.systemExercises} system, ${stats.customExercises} custom` : 'Loading catalog...'}
            icon={<Dumbbell className="h-5 w-5" />}
            accent="teal"
          />
          <StatsCard
            title="Curated Routines"
            value={stats ? stats.totalTemplates : '—'}
            subtitle="Verified starter templates"
            icon={<Layers className="h-5 w-5" />}
            accent="emerald"
          />
          <StatsCard
            title="Sessions Completed"
            value={stats ? stats.totalSessions.toLocaleString() : '—'}
            subtitle="Total member logs"
            icon={<Activity className="h-5 w-5" />}
            accent="purple"
          />
          <StatsCard
            title="Total Volume Lifted"
            value={stats ? formatVolume(stats.totalVolumeKg) : '—'}
            subtitle="Cumulative weight moved"
            icon={<Flame className="h-5 w-5" />}
            accent="amber"
          />
        </div>

        {/* Tab Navigation */}
        <div className="flex border-b border-slate-800">
          <button
            onClick={() => setActiveTab('exercises')}
            className={`flex items-center gap-2 px-5 py-3 text-xs font-semibold uppercase tracking-wider transition-all border-b-2 ${
              activeTab === 'exercises'
                ? 'border-teal-500 text-teal-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Dumbbell className="h-4 w-4" />
            Exercise Library ({exercisesMeta.total})
          </button>
          <button
            onClick={() => setActiveTab('templates')}
            className={`flex items-center gap-2 px-5 py-3 text-xs font-semibold uppercase tracking-wider transition-all border-b-2 ${
              activeTab === 'templates'
                ? 'border-teal-500 text-teal-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Layers className="h-4 w-4" />
            Curated Routines ({templatesMeta.total})
          </button>
        </div>

        {/* Tab Content: Exercises */}
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
              onDeleteExercise={setExerciseToDelete}
            />
          </div>
        )}

        {/* Tab Content: Templates */}
        {activeTab === 'templates' && (
          <div className="space-y-4">
            <div className="flex justify-end">
              <button
                onClick={handleOpenCreateTemplate}
                className="flex items-center gap-1.5 rounded-xl bg-teal-500 hover:bg-teal-400 px-4 py-2 text-xs font-semibold text-slate-950 shadow-md shadow-teal-500/20 transition-all"
              >
                Create Starter Routine
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

        {/* Exercise Create / Edit Modal */}
        <ExerciseModal
          isOpen={isExerciseModalOpen}
          onClose={() => setIsExerciseModalOpen(false)}
          exercise={selectedExercise}
          onSubmit={handleSubmitExercise}
        />

        {/* Template Create / Edit Modal */}
        <WorkoutTemplateModal
          isOpen={isTemplateModalOpen}
          onClose={() => setIsTemplateModalOpen(false)}
          template={selectedTemplate}
          availableExercises={exercises}
          onSubmit={handleSubmitTemplate}
        />

        {/* Delete Exercise Confirmation Modal */}
        {exerciseToDelete && (
          <Modal
            isOpen={Boolean(exerciseToDelete)}
            onClose={() => setExerciseToDelete(null)}
            title="Delete Exercise"
            description="Are you sure you want to remove this exercise from the catalog?"
            maxWidth="sm"
          >
            <div className="space-y-4">
              <div className="rounded-xl border border-rose-500/20 bg-rose-500/10 p-3 flex items-start gap-2 text-xs text-rose-300">
                <AlertTriangle className="h-4 w-4 text-rose-400 shrink-0 mt-0.5" />
                <span>
                  Deleting <strong>{exerciseToDelete.name}</strong> will soft-delete it. Existing workout logs referencing this exercise will retain their historical volume data.
                </span>
              </div>
              <div className="flex justify-end gap-3 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setExerciseToDelete(null)}
                  disabled={isDeletingExercise}
                  className="rounded-xl border border-slate-800 bg-slate-900 px-4 py-2 text-xs font-medium text-slate-300 hover:bg-slate-800 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleDeleteExerciseConfirm}
                  disabled={isDeletingExercise}
                  className="rounded-xl bg-rose-600 hover:bg-rose-500 px-4 py-2 text-xs font-semibold text-white shadow-md shadow-rose-600/20 transition-all disabled:opacity-50"
                >
                  {isDeletingExercise ? 'Deleting...' : 'Confirm Delete'}
                </button>
              </div>
            </div>
          </Modal>
        )}

        {/* Delete Template Confirmation Modal */}
        {templateToDelete && (
          <Modal
            isOpen={Boolean(templateToDelete)}
            onClose={() => setTemplateToDelete(null)}
            title="Delete Routine Template"
            description="Are you sure you want to remove this curated starter routine?"
            maxWidth="sm"
          >
            <div className="space-y-4">
              <div className="rounded-xl border border-rose-500/20 bg-rose-500/10 p-3 flex items-start gap-2 text-xs text-rose-300">
                <AlertTriangle className="h-4 w-4 text-rose-400 shrink-0 mt-0.5" />
                <span>
                  Deleting <strong>{templateToDelete.name}</strong> will remove it from new members&apos; starter lists. Members who have already logged or cloned this routine will keep their copies.
                </span>
              </div>
              <div className="flex justify-end gap-3 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setTemplateToDelete(null)}
                  disabled={isDeletingTemplate}
                  className="rounded-xl border border-slate-800 bg-slate-900 px-4 py-2 text-xs font-medium text-slate-300 hover:bg-slate-800 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleDeleteTemplateConfirm}
                  disabled={isDeletingTemplate}
                  className="rounded-xl bg-rose-600 hover:bg-rose-500 px-4 py-2 text-xs font-semibold text-white shadow-md shadow-rose-600/20 transition-all disabled:opacity-50"
                >
                  {isDeletingTemplate ? 'Deleting...' : 'Confirm Delete'}
                </button>
              </div>
            </div>
          </Modal>
        )}
      </div>
    </AdminLayout>
  );
}
