'use client';

import React from 'react';
import { Search, Plus } from 'lucide-react';

interface ExerciseFilterBarProps {
  search: string;
  onSearchChange: (value: string) => void;
  muscle: string;
  onMuscleChange: (value: string) => void;
  category: string;
  onCategoryChange: (value: string) => void;
  equipment: string;
  onEquipmentChange: (value: string) => void;
  difficulty: string;
  onDifficultyChange: (value: string) => void;
  onSubmit: (e: React.FormEvent) => void;
  onOpenCreateModal: () => void;
}

export function ExerciseFilterBar({
  search,
  onSearchChange,
  muscle,
  onMuscleChange,
  category,
  onCategoryChange,
  equipment,
  onEquipmentChange,
  difficulty,
  onDifficultyChange,
  onSubmit,
  onOpenCreateModal,
}: ExerciseFilterBarProps) {
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4 backdrop-blur-sm">
      <form
        onSubmit={onSubmit}
        className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between"
      >
        {/* Search Input */}
        <div className="relative flex-1">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
          <input
            type="text"
            placeholder="Search exercises by name..."
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            className="w-full rounded-xl border border-slate-800 bg-slate-950/80 pl-10 pr-4 py-2 text-xs text-white placeholder-slate-500 focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500 transition-colors"
          />
        </div>

        {/* Filter Dropdowns */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Muscle */}
          <select
            value={muscle}
            onChange={(e) => onMuscleChange(e.target.value)}
            className="rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-xs text-slate-300 focus:border-teal-500 focus:outline-none"
          >
            <option value="">All Muscles</option>
            <option value="chest">Chest</option>
            <option value="back">Back</option>
            <option value="quadriceps">Quadriceps</option>
            <option value="hamstrings">Hamstrings</option>
            <option value="glutes">Glutes</option>
            <option value="shoulders">Shoulders</option>
            <option value="biceps">Biceps</option>
            <option value="triceps">Triceps</option>
            <option value="abdominals">Abdominals</option>
          </select>

          {/* Category */}
          <select
            value={category}
            onChange={(e) => onCategoryChange(e.target.value)}
            className="rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-xs text-slate-300 focus:border-teal-500 focus:outline-none"
          >
            <option value="">All Categories</option>
            <option value="strength">Strength</option>
            <option value="hypertrophy">Hypertrophy</option>
            <option value="endurance">Endurance</option>
            <option value="mobility">Mobility</option>
            <option value="cardio">Cardio</option>
          </select>

          {/* Equipment */}
          <select
            value={equipment}
            onChange={(e) => onEquipmentChange(e.target.value)}
            className="rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-xs text-slate-300 focus:border-teal-500 focus:outline-none"
          >
            <option value="">All Equipment</option>
            <option value="barbell">Barbell</option>
            <option value="dumbbell">Dumbbell</option>
            <option value="cable">Cable</option>
            <option value="machine">Machine</option>
            <option value="bodyweight">Bodyweight</option>
            <option value="kettlebell">Kettlebell</option>
          </select>

          {/* Difficulty */}
          <select
            value={difficulty}
            onChange={(e) => onDifficultyChange(e.target.value)}
            className="rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-xs text-slate-300 focus:border-teal-500 focus:outline-none"
          >
            <option value="">All Levels</option>
            <option value="beginner">Beginner</option>
            <option value="intermediate">Intermediate</option>
            <option value="advanced">Advanced</option>
          </select>

          {/* Add Exercise CTA */}
          <button
            type="button"
            onClick={onOpenCreateModal}
            className="flex items-center gap-1.5 rounded-xl bg-teal-500 hover:bg-teal-400 px-3.5 py-2 text-xs font-semibold text-slate-950 shadow-md shadow-teal-500/20 transition-all ml-auto"
          >
            <Plus className="h-4 w-4 stroke-[2.5]" />
            Add Exercise
          </button>
        </div>
      </form>
    </div>
  );
}

