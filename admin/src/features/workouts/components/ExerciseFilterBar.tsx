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
    <form onSubmit={onSubmit} role="search" aria-label="Filter exercises" className="toolbar">
      <div className="relative min-w-0 flex-1">
        <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-500" />
        <label htmlFor="exercise-search" className="sr-only">Search exercises</label>
        <input
          id="exercise-search"
          type="search"
          placeholder="Search exercises by name…"
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          className="input pl-9"
        />
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:flex lg:items-center">
        <label htmlFor="exercise-muscle" className="sr-only">Muscle</label>
        <select
          value={muscle}
          onChange={(e) => onMuscleChange(e.target.value)}
          id="exercise-muscle"
          className="input lg:w-36"
        >
          <option value="">All muscles</option>
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
        <label htmlFor="exercise-category" className="sr-only">Category</label>
        <select
          value={category}
          onChange={(e) => onCategoryChange(e.target.value)}
          id="exercise-category"
          className="input lg:w-36"
        >
          <option value="">All categories</option>
          <option value="strength">Strength</option>
          <option value="hypertrophy">Hypertrophy</option>
          <option value="endurance">Endurance</option>
          <option value="mobility">Mobility</option>
          <option value="cardio">Cardio</option>
        </select>
        <label htmlFor="exercise-equipment" className="sr-only">Equipment</label>
        <select
          value={equipment}
          onChange={(e) => onEquipmentChange(e.target.value)}
          id="exercise-equipment"
          className="input lg:w-36"
        >
          <option value="">All equipment</option>
          <option value="barbell">Barbell</option>
          <option value="dumbbell">Dumbbell</option>
          <option value="cable">Cable</option>
          <option value="machine">Machine</option>
          <option value="bodyweight">Bodyweight</option>
          <option value="kettlebell">Kettlebell</option>
        </select>
        <label htmlFor="exercise-difficulty" className="sr-only">Difficulty</label>
        <select
          value={difficulty}
          onChange={(e) => onDifficultyChange(e.target.value)}
          id="exercise-difficulty"
          className="input lg:w-36"
        >
          <option value="">All levels</option>
          <option value="beginner">Beginner</option>
          <option value="intermediate">Intermediate</option>
          <option value="advanced">Advanced</option>
        </select>
      </div>

      <div className="flex flex-wrap items-center gap-2 lg:ml-auto">
        <button type="submit" className="btn btn-secondary">
          <Search className="h-3.5 w-3.5" />
          Search
        </button>
        <button type="button" onClick={onOpenCreateModal} className="btn btn-primary">
          <Plus className="h-4 w-4" />
          Add exercise
        </button>
      </div>
    </form>
  );
}
