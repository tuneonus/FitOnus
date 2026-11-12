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
    <form onSubmit={handleSubmit} className="space-y-4 text-[13px]">
      {error && (
        <div className="alert alert-error">
          {error}
        </div>
      )}

      {/* Basic Identity */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div className="md:col-span-2">
          <label htmlFor="foodmodal-field-1" className="field-label">
            Food Name <span className="text-rose-300" aria-hidden="true">*</span>
          </label>
          <input
            id="foodmodal-field-1"
            type="text"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Chicken Breast, raw"
            className="input"
          />
        </div>
        <div>
          <label htmlFor="foodmodal-field-2" className="field-label">Brand</label>
          <input
            id="foodmodal-field-2"
            type="text"
            value={brand}
            onChange={(e) => setBrand(e.target.value)}
            placeholder="e.g. Kirkland, Tyson (or blank)"
            className="input"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div>
          <label htmlFor="foodmodal-field-3" className="field-label">
            Barcode / UPC
          </label>
          <input
            id="foodmodal-field-3"
            type="text"
            value={barcode}
            onChange={(e) => setBarcode(e.target.value)}
            placeholder="e.g. 012345678901"
            className="input font-mono"
          />
        </div>
        <div>
          <label htmlFor="foodmodal-field-4" className="field-label">
            Data Source <span className="text-rose-300" aria-hidden="true">*</span>
          </label>
          <select
            id="foodmodal-field-4"
            value={dataSource}
            onChange={(e) =>
              setDataSource(
                e.target.value as 'usda_fdc' | 'open_food_facts' | 'manufacturer_label'
              )
            }
            className="input"
          >
            <option value="usda_fdc">USDA FoodData Central (Authoritative)</option>
            <option value="manufacturer_label">Manufacturer Nutrition Facts</option>
            <option value="open_food_facts">Open Food Facts</option>
          </select>
        </div>
        <div>
          <label htmlFor="foodmodal-field-5" className="field-label">
            Source ID / FDC ID
          </label>
          <input
            id="foodmodal-field-5"
            type="text"
            value={sourceId}
            onChange={(e) => setSourceId(e.target.value)}
            placeholder="e.g. 171265"
            className="input font-mono"
          />
        </div>
      </div>

      {/* Serving Specifications */}
      <div className="card-inset space-y-3 p-4">
        <h4 className="eyebrow">
          Serving Contract & Physical Parameters
        </h4>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div>
            <label htmlFor="foodmodal-field-6" className="field-label">
              Serving Size <span className="text-rose-300" aria-hidden="true">*</span>
            </label>
            <input
            id="foodmodal-field-6"
              type="number"
              step="any"
              min="0.01"
              required
              value={servingSize}
              onChange={(e) => setServingSize(parseFloat(e.target.value) || 0)}
              className="input font-mono"
            />
          </div>
          <div>
            <label htmlFor="foodmodal-field-7" className="field-label">
              Serving Unit <span className="text-rose-300" aria-hidden="true">*</span>
            </label>
            <input
            id="foodmodal-field-7"
              type="text"
              required
              value={servingUnit}
              onChange={(e) => setServingUnit(e.target.value)}
              placeholder="piece, cup, tbsp, g"
              className="input"
            />
          </div>
          <div>
            <label htmlFor="foodmodal-field-8" className="field-label">
              Weight (g) <span className="text-rose-300" aria-hidden="true">*</span>
            </label>
            <input
            id="foodmodal-field-8"
              type="number"
              step="any"
              min="0.01"
              required
              value={servingWeightG}
              onChange={(e) => setServingWeightG(parseFloat(e.target.value) || 0)}
              className="input font-mono"
            />
          </div>
          <div>
            <label htmlFor="foodmodal-field-9" className="field-label">
              Serving Basis
            </label>
            <select
            id="foodmodal-field-9"
              value={servingBasis}
              onChange={(e) =>
                setServingBasis(e.target.value as '100g' | 'serving' | '100ml')
              }
              className="input"
            >
              <option value="100g">Per 100g (Standard)</option>
              <option value="serving">Per Serving</option>
              <option value="100ml">Per 100ml</option>
            </select>
          </div>
        </div>

        {/* Optional Liquid / Density Parameters */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-ink-800">
          <div>
            <label htmlFor="foodmodal-field-10" className="field-label">
              Volume (ml) <span className="font-normal text-ink-500">(Liquids/Oils only)</span>
            </label>
            <input
            id="foodmodal-field-10"
              type="number"
              step="any"
              min="0.1"
              value={servingVolumeMl}
              onChange={(e) => setServingVolumeMl(e.target.value)}
              placeholder="e.g. 237 (1 cup milk)"
              className="input font-mono"
            />
          </div>
          <div>
            <label htmlFor="foodmodal-field-11" className="field-label">
              Density ρ (g/ml) <span className="font-normal text-ink-500">(e.g. 1.0313 milk)</span>
            </label>
            <input
            id="foodmodal-field-11"
              type="number"
              step="any"
              min="0.0001"
              value={densityGPerMl}
              onChange={(e) => setDensityGPerMl(e.target.value)}
              placeholder="e.g. 0.9184 (olive oil)"
              className="input font-mono"
            />
          </div>
        </div>

        {/* Density Sanity Feedback */}
        {expectedWeightFromDensity !== null && (
          <div
            className={`p-2 rounded-lg text-[11px] font-mono flex items-center justify-between border ${
              densityDiscrepancyPct! <= 15
                ? 'bg-brand-950/40 border-brand-800 text-brand-300'
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
      <div className="card-inset space-y-3 p-4">
        <h4 className="eyebrow">
          Nutritional Facts (Per 100g Reference Basis)
        </h4>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div>
            <label htmlFor="foodmodal-field-12" className="field-label">
              Calories (kcal) <span className="text-rose-300" aria-hidden="true">*</span>
            </label>
            <input
            id="foodmodal-field-12"
              type="number"
              step="any"
              min="0"
              required
              value={calories}
              onChange={(e) => setCalories(parseFloat(e.target.value) || 0)}
              className="input font-mono"
            />
          </div>
          <div>
            <label htmlFor="foodmodal-field-13" className="field-label">
              Protein (g) <span className="text-rose-300" aria-hidden="true">*</span>
            </label>
            <input
            id="foodmodal-field-13"
              type="number"
              step="any"
              min="0"
              required
              value={proteinG}
              onChange={(e) => setProteinG(parseFloat(e.target.value) || 0)}
              className="input font-mono"
            />
          </div>
          <div>
            <label htmlFor="foodmodal-field-14" className="field-label">
              Carbohydrates (g) <span className="text-rose-300" aria-hidden="true">*</span>
            </label>
            <input
            id="foodmodal-field-14"
              type="number"
              step="any"
              min="0"
              required
              value={carbohydratesG}
              onChange={(e) => setCarbohydratesG(parseFloat(e.target.value) || 0)}
              className="input font-mono"
            />
          </div>
          <div>
            <label htmlFor="foodmodal-field-15" className="field-label">
              Fat (g) <span className="text-rose-300" aria-hidden="true">*</span>
            </label>
            <input
            id="foodmodal-field-15"
              type="number"
              step="any"
              min="0"
              required
              value={fatG}
              onChange={(e) => setFatG(parseFloat(e.target.value) || 0)}
              className="input font-mono"
            />
          </div>
        </div>

        {/* Micronutrients */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2 border-t border-ink-800">
          <div>
            <label htmlFor="foodmodal-field-16" className="field-label">Fiber (g)</label>
            <input
            id="foodmodal-field-16"
              type="number"
              step="any"
              min="0"
              value={fiberG}
              onChange={(e) => setFiberG(parseFloat(e.target.value) || 0)}
              className="input font-mono"
            />
          </div>
          <div>
            <label htmlFor="foodmodal-field-17" className="field-label">Sugar (g)</label>
            <input
            id="foodmodal-field-17"
              type="number"
              step="any"
              min="0"
              value={sugarG}
              onChange={(e) => setSugarG(parseFloat(e.target.value) || 0)}
              className="input font-mono"
            />
          </div>
          <div>
            <label htmlFor="foodmodal-field-18" className="field-label">Sodium (mg)</label>
            <input
            id="foodmodal-field-18"
              type="number"
              step="any"
              min="0"
              value={sodiumMg}
              onChange={(e) => setSodiumMg(parseFloat(e.target.value) || 0)}
              className="input font-mono"
            />
          </div>
          <div>
            <label htmlFor="foodmodal-field-19" className="field-label">
              Cholesterol (mg)
            </label>
            <input
            id="foodmodal-field-19"
              type="number"
              step="any"
              min="0"
              value={cholesterolMg}
              onChange={(e) => setCholesterolMg(parseFloat(e.target.value) || 0)}
              className="input font-mono"
            />
          </div>
        </div>
      </div>

      {/* Buttons */}
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
