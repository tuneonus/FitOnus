'use client';

import React, { useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import type { AdminFood, CreateFoodInput, UpdateFoodInput } from '../types';

interface FoodModalProps {
  isOpen: boolean;
  onClose: () => void;
  food: AdminFood | null; // null for Create, non-null for Edit
  onSubmit: (data: CreateFoodInput | UpdateFoodInput) => Promise<void>;
}

function FoodForm({
  food,
  onClose,
  onSubmit,
}: {
  food: AdminFood | null;
  onClose: () => void;
  onSubmit: (data: CreateFoodInput | UpdateFoodInput) => Promise<void>;
}) {
  const isEditing = Boolean(food);

  // Basic Info
  const [name, setName] = useState(food?.name || '');
  const [brand, setBrand] = useState(food?.brand || '');
  const [barcode, setBarcode] = useState(food?.barcode || '');

  // Serving Parameters
  const [servingSize, setServingSize] = useState<number>(food?.servingSize ?? 100);
  const [servingUnit, setServingUnit] = useState(food?.servingUnit || 'g');
  const [servingWeightG, setServingWeightG] = useState<number>(food?.servingWeightG ?? 100);
  const [servingVolumeMl, setServingVolumeMl] = useState<string>(
    food?.servingVolumeMl ? String(food.servingVolumeMl) : ''
  );
  const [densityGPerMl, setDensityGPerMl] = useState<string>(
    food?.densityGPerMl ? String(food.densityGPerMl) : ''
  );
  const [servingBasis, setServingBasis] = useState<'100g' | 'serving' | '100ml'>(
    food?.servingBasis || '100g'
  );

  // Nutritional Values (per reference basis, typically 100g)
  const [calories, setCalories] = useState<number>(food?.referenceNutrients.calories ?? 0);
  const [proteinG, setProteinG] = useState<number>(food?.referenceNutrients.proteinG ?? 0);
  const [carbohydratesG, setCarbohydratesG] = useState<number>(
    food?.referenceNutrients.carbohydratesG ?? 0
  );
  const [fatG, setFatG] = useState<number>(food?.referenceNutrients.fatG ?? 0);
  const [fiberG, setFiberG] = useState<number>(food?.referenceNutrients.fiberG ?? 0);
  const [sugarG, setSugarG] = useState<number>(food?.referenceNutrients.sugarG ?? 0);
  const [sodiumMg, setSodiumMg] = useState<number>(food?.referenceNutrients.sodiumMg ?? 0);
  const [cholesterolMg, setCholesterolMg] = useState<number>(
    food?.referenceNutrients.cholesterolMg ?? 0
  );

  // Provenance
  const [dataSource, setDataSource] = useState<
    'usda_fdc' | 'open_food_facts' | 'manufacturer_label'
  >(
    food?.dataSource === 'manufacturer_label' || food?.dataSource === 'open_food_facts'
      ? food.dataSource
      : 'usda_fdc'
  );
  const [sourceId, setSourceId] = useState(food?.sourceId || '');

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Live density validation calculation
  const numVolume = servingVolumeMl ? parseFloat(servingVolumeMl) : null;
  const numDensity = densityGPerMl ? parseFloat(densityGPerMl) : null;
  const expectedWeightFromDensity =
    numVolume && numDensity ? Math.round(numVolume * numDensity * 10) / 10 : null;
  const densityDiscrepancyPct =
    expectedWeightFromDensity && servingWeightG > 0
      ? (Math.abs(servingWeightG - expectedWeightFromDensity) / servingWeightG) * 100
      : null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError('Food name is required.');
      return;
    }

    if (servingWeightG <= 0 || servingSize <= 0) {
      setError('Serving size and weight in grams must be greater than zero.');
      return;
    }

    // Macro sanity check
    if (servingBasis === '100g' && proteinG + carbohydratesG + fatG > 105) {
      setError(
        `Total macronutrients (${(proteinG + carbohydratesG + fatG).toFixed(
          1
        )}g) cannot exceed 100g on a 100g serving basis.`
      );
      return;
    }

    // Density consistency check
    if (densityDiscrepancyPct !== null && densityDiscrepancyPct > 15) {
      setError(
        `Serving weight (${servingWeightG}g) deviates by ${densityDiscrepancyPct.toFixed(
          1
        )}% from volume × density expected weight (~${expectedWeightFromDensity}g). Must be within 15% tolerance.`
      );
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const payload: CreateFoodInput = {
        name: name.trim(),
        brand: brand.trim() || null,
        barcode: barcode.trim() || null,
        servingSize,
        servingUnit: servingUnit.trim(),
        servingWeightG,
        servingVolumeMl: numVolume,
        densityGPerMl: numDensity,
        servingBasis,
        calories: Number(calories),
        proteinG: Number(proteinG),
        carbohydratesG: Number(carbohydratesG),
        fatG: Number(fatG),
        fiberG: Number(fiberG),
        sugarG: Number(sugarG),
        sodiumMg: Number(sodiumMg),
        cholesterolMg: Number(cholesterolMg),
        dataSource,
        sourceId: sourceId.trim() || null,
      };

      await onSubmit(payload);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save food record.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4 text-xs">
      {error && (
        <div className="rounded-xl border border-rose-500/20 bg-rose-500/10 p-3 text-xs text-rose-400">
          {error}
        </div>
      )}

      {/* Basic Identity */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div className="md:col-span-2">
          <label className="block font-semibold text-slate-300 mb-1">
            Food Name <span className="text-rose-400">*</span>
          </label>
          <input
            type="text"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Chicken Breast, raw"
            className="w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-white placeholder-slate-600 focus:border-teal-500 focus:outline-none"
          />
        </div>
        <div>
          <label className="block font-semibold text-slate-300 mb-1">Brand</label>
          <input
            type="text"
            value={brand}
            onChange={(e) => setBrand(e.target.value)}
            placeholder="e.g. Kirkland, Tyson (or blank)"
            className="w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-white placeholder-slate-600 focus:border-teal-500 focus:outline-none"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div>
          <label className="block font-semibold text-slate-300 mb-1">
            Barcode / UPC
          </label>
          <input
            type="text"
            value={barcode}
            onChange={(e) => setBarcode(e.target.value)}
            placeholder="e.g. 012345678901"
            className="w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-white placeholder-slate-600 focus:border-teal-500 focus:outline-none font-mono"
          />
        </div>
        <div>
          <label className="block font-semibold text-slate-300 mb-1">
            Data Source <span className="text-rose-400">*</span>
          </label>
          <select
            value={dataSource}
            onChange={(e) =>
              setDataSource(
                e.target.value as 'usda_fdc' | 'open_food_facts' | 'manufacturer_label'
              )
            }
            className="w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-white focus:border-teal-500 focus:outline-none"
          >
            <option value="usda_fdc">USDA FoodData Central (Authoritative)</option>
            <option value="manufacturer_label">Manufacturer Nutrition Facts</option>
            <option value="open_food_facts">Open Food Facts</option>
          </select>
        </div>
        <div>
          <label className="block font-semibold text-slate-300 mb-1">
            Source ID / FDC ID
          </label>
          <input
            type="text"
            value={sourceId}
            onChange={(e) => setSourceId(e.target.value)}
            placeholder="e.g. 171265"
            className="w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-white placeholder-slate-600 focus:border-teal-500 focus:outline-none font-mono"
          />
        </div>
      </div>

      {/* Serving Specifications */}
      <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3 space-y-3">
        <h4 className="font-semibold text-slate-300 uppercase tracking-wider text-[11px]">
          Serving Contract & Physical Parameters
        </h4>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div>
            <label className="block font-medium text-slate-400 mb-1">
              Serving Size <span className="text-rose-400">*</span>
            </label>
            <input
              type="number"
              step="any"
              min="0.01"
              required
              value={servingSize}
              onChange={(e) => setServingSize(parseFloat(e.target.value) || 0)}
              className="w-full rounded-xl border border-slate-800 bg-slate-900 px-3 py-2 text-white focus:border-teal-500 focus:outline-none font-mono"
            />
          </div>
          <div>
            <label className="block font-medium text-slate-400 mb-1">
              Serving Unit <span className="text-rose-400">*</span>
            </label>
            <input
              type="text"
              required
              value={servingUnit}
              onChange={(e) => setServingUnit(e.target.value)}
              placeholder="piece, cup, tbsp, g"
              className="w-full rounded-xl border border-slate-800 bg-slate-900 px-3 py-2 text-white focus:border-teal-500 focus:outline-none"
            />
          </div>
          <div>
            <label className="block font-medium text-slate-400 mb-1">
              Weight (g) <span className="text-rose-400">*</span>
            </label>
            <input
              type="number"
              step="any"
              min="0.01"
              required
              value={servingWeightG}
              onChange={(e) => setServingWeightG(parseFloat(e.target.value) || 0)}
              className="w-full rounded-xl border border-slate-800 bg-slate-900 px-3 py-2 text-white focus:border-teal-500 focus:outline-none font-mono"
            />
          </div>
          <div>
            <label className="block font-medium text-slate-400 mb-1">
              Serving Basis
            </label>
            <select
              value={servingBasis}
              onChange={(e) =>
                setServingBasis(e.target.value as '100g' | 'serving' | '100ml')
              }
              className="w-full rounded-xl border border-slate-800 bg-slate-900 px-3 py-2 text-white focus:border-teal-500 focus:outline-none"
            >
              <option value="100g">Per 100g (Standard)</option>
              <option value="serving">Per Serving</option>
              <option value="100ml">Per 100ml</option>
            </select>
          </div>
        </div>

        {/* Optional Liquid / Density Parameters */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-slate-800/80">
          <div>
            <label className="block font-medium text-slate-400 mb-1">
              Volume (ml) <span className="text-slate-600 font-normal">(Liquids/Oils only)</span>
            </label>
            <input
              type="number"
              step="any"
              min="0.1"
              value={servingVolumeMl}
              onChange={(e) => setServingVolumeMl(e.target.value)}
              placeholder="e.g. 237 (1 cup milk)"
              className="w-full rounded-xl border border-slate-800 bg-slate-900 px-3 py-2 text-white placeholder-slate-600 focus:border-teal-500 focus:outline-none font-mono"
            />
          </div>
          <div>
            <label className="block font-medium text-slate-400 mb-1">
              Density ρ (g/ml) <span className="text-slate-600 font-normal">(e.g. 1.0313 milk)</span>
            </label>
            <input
              type="number"
              step="any"
              min="0.0001"
              value={densityGPerMl}
              onChange={(e) => setDensityGPerMl(e.target.value)}
              placeholder="e.g. 0.9184 (olive oil)"
              className="w-full rounded-xl border border-slate-800 bg-slate-900 px-3 py-2 text-white placeholder-slate-600 focus:border-teal-500 focus:outline-none font-mono"
            />
          </div>
        </div>

        {/* Density Sanity Feedback */}
        {expectedWeightFromDensity !== null && (
          <div
            className={`p-2 rounded-lg text-[11px] font-mono flex items-center justify-between border ${
              densityDiscrepancyPct! <= 15
                ? 'bg-teal-950/40 border-teal-800 text-teal-300'
                : 'bg-rose-950/40 border-rose-800 text-rose-300'
            }`}
          >
            <span>
              Expected: {numVolume}ml × {numDensity} g/ml = {expectedWeightFromDensity}g
            </span>
            <span>
              Discrepancy: {densityDiscrepancyPct!.toFixed(1)}% (
              {densityDiscrepancyPct! <= 15 ? 'Consistent' : 'Inconsistent > 15%'})
            </span>
          </div>
        )}
      </div>

      {/* Reference Nutrients */}
      <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3 space-y-3">
        <h4 className="font-semibold text-slate-300 uppercase tracking-wider text-[11px]">
          Nutritional Facts (Per 100g Reference Basis)
        </h4>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div>
            <label className="block font-medium text-slate-400 mb-1">
              Calories (kcal) <span className="text-rose-400">*</span>
            </label>
            <input
              type="number"
              step="any"
              min="0"
              required
              value={calories}
              onChange={(e) => setCalories(parseFloat(e.target.value) || 0)}
              className="w-full rounded-xl border border-slate-800 bg-slate-900 px-3 py-2 text-teal-300 font-bold focus:border-teal-500 focus:outline-none font-mono"
            />
          </div>
          <div>
            <label className="block font-medium text-slate-400 mb-1">
              Protein (g) <span className="text-rose-400">*</span>
            </label>
            <input
              type="number"
              step="any"
              min="0"
              required
              value={proteinG}
              onChange={(e) => setProteinG(parseFloat(e.target.value) || 0)}
              className="w-full rounded-xl border border-slate-800 bg-slate-900 px-3 py-2 text-white focus:border-teal-500 focus:outline-none font-mono"
            />
          </div>
          <div>
            <label className="block font-medium text-slate-400 mb-1">
              Carbohydrates (g) <span className="text-rose-400">*</span>
            </label>
            <input
              type="number"
              step="any"
              min="0"
              required
              value={carbohydratesG}
              onChange={(e) => setCarbohydratesG(parseFloat(e.target.value) || 0)}
              className="w-full rounded-xl border border-slate-800 bg-slate-900 px-3 py-2 text-white focus:border-teal-500 focus:outline-none font-mono"
            />
          </div>
          <div>
            <label className="block font-medium text-slate-400 mb-1">
              Fat (g) <span className="text-rose-400">*</span>
            </label>
            <input
              type="number"
              step="any"
              min="0"
              required
              value={fatG}
              onChange={(e) => setFatG(parseFloat(e.target.value) || 0)}
              className="w-full rounded-xl border border-slate-800 bg-slate-900 px-3 py-2 text-white focus:border-teal-500 focus:outline-none font-mono"
            />
          </div>
        </div>

        {/* Micronutrients */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2 border-t border-slate-800/80">
          <div>
            <label className="block font-medium text-slate-400 mb-1">Fiber (g)</label>
            <input
              type="number"
              step="any"
              min="0"
              value={fiberG}
              onChange={(e) => setFiberG(parseFloat(e.target.value) || 0)}
              className="w-full rounded-xl border border-slate-800 bg-slate-900 px-3 py-2 text-white focus:border-teal-500 focus:outline-none font-mono"
            />
          </div>
          <div>
            <label className="block font-medium text-slate-400 mb-1">Sugar (g)</label>
            <input
              type="number"
              step="any"
              min="0"
              value={sugarG}
              onChange={(e) => setSugarG(parseFloat(e.target.value) || 0)}
              className="w-full rounded-xl border border-slate-800 bg-slate-900 px-3 py-2 text-white focus:border-teal-500 focus:outline-none font-mono"
            />
          </div>
          <div>
            <label className="block font-medium text-slate-400 mb-1">Sodium (mg)</label>
            <input
              type="number"
              step="any"
              min="0"
              value={sodiumMg}
              onChange={(e) => setSodiumMg(parseFloat(e.target.value) || 0)}
              className="w-full rounded-xl border border-slate-800 bg-slate-900 px-3 py-2 text-white focus:border-teal-500 focus:outline-none font-mono"
            />
          </div>
          <div>
            <label className="block font-medium text-slate-400 mb-1">
              Cholesterol (mg)
            </label>
            <input
              type="number"
              step="any"
              min="0"
              value={cholesterolMg}
              onChange={(e) => setCholesterolMg(parseFloat(e.target.value) || 0)}
              className="w-full rounded-xl border border-slate-800 bg-slate-900 px-3 py-2 text-white focus:border-teal-500 focus:outline-none font-mono"
            />
          </div>
        </div>
      </div>

      {/* Buttons */}
      <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-800">
        <button
          type="button"
          onClick={onClose}
          disabled={isSubmitting}
          className="rounded-xl border border-slate-800 bg-slate-900 px-4 py-2 text-slate-300 hover:bg-slate-800 transition-colors"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={isSubmitting}
          className="rounded-xl bg-gradient-to-r from-teal-500 to-emerald-500 px-5 py-2 font-semibold text-slate-950 hover:brightness-110 shadow-lg shadow-teal-500/20 disabled:opacity-50 transition-all"
        >
          {isSubmitting ? 'Saving Food...' : isEditing ? 'Update Food' : 'Create Verified Food'}
        </button>
      </div>
    </form>
  );
}

export function FoodModal({ isOpen, onClose, food, onSubmit }: FoodModalProps) {
  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={food ? `Edit Food: ${food.name}` : 'Add Verified Food'}
      description={
        food
          ? 'Update serving parameters, data source provenance, or macronutrients.'
          : 'Create a new verified food item in the system nutrition catalog.'
      }
      maxWidth="2xl"
    >
      <FoodForm food={food} onClose={onClose} onSubmit={onSubmit} />
    </Modal>
  );
}
