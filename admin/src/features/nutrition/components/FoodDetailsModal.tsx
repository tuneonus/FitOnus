'use client';

import React from 'react';
import { Modal } from '@/components/ui/Modal';
import { Badge } from '@/components/ui/Badge';
import { Lock, Scale } from 'lucide-react';
import type { AdminFood } from '../types';

interface FoodDetailsModalProps {
  isOpen: boolean;
  onClose: () => void;
  food: AdminFood | null;
}

export function FoodDetailsModal({ isOpen, onClose, food }: FoodDetailsModalProps) {
  if (!food) return null;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={food.name}
      description={food.brand ? `Brand: ${food.brand}` : 'Generic Food Record'}
      maxWidth="xl"
    >
      <div className="space-y-4 text-[13px]">
        {/* Status Banners */}
        <div className="flex flex-wrap items-center gap-2">
          {food.isVerified ? (
            <Badge variant="active" size="md">
              Verified Catalog Item
            </Badge>
          ) : food.verificationStatus === 'rejected' ? (
            <Badge variant="disabled" size="md">
              Rejected
            </Badge>
          ) : (
            <Badge variant="pending" size="md">
              Unverified
            </Badge>
          )}

          {food.isCustom ? (
            <Badge variant="admin" size="md">
              User Custom Food
            </Badge>
          ) : (
            <Badge variant="completed" size="md">
              System Verified
            </Badge>
          )}

          {food.deletedAt && (
            <Badge variant="disabled" size="md">
              Soft Deleted ({new Date(food.deletedAt).toLocaleDateString()})
            </Badge>
          )}
        </div>

        {/* Security Alert for User Custom Foods */}
        {food.isCustom && (
          <div className="alert border-purple-500/25 bg-purple-500/[0.06] text-purple-200">
            <Lock className="mt-0.5 h-4 w-4 shrink-0 text-purple-300" />
            <div className="space-y-1">
              <p className="font-semibold text-purple-200">
                Private User-Owned Food Record
              </p>
              <p className="text-xs leading-relaxed text-purple-200/75">
                This custom food is scoped exclusively to user tenant{' '}
                <span className="font-mono text-purple-200">{food.createdBy}</span>.
                It is never exposed globally. To preserve user consent and privacy,
                promotion to the global catalog is restricted.
              </p>
            </div>
          </div>
        )}

        {/* Serving Card */}
        <div className="card-inset space-y-2 p-3.5">
          <div className="flex items-center justify-between text-ink-300">
            <span className="flex items-center gap-1.5 font-medium text-ink-200">
              <Scale className="h-4 w-4 text-ink-400" />
              Serving
            </span>
            <span className="font-mono text-white">
              {food.servingSize} {food.servingUnit} = {food.servingWeightG}g
            </span>
          </div>

          {food.servingVolumeMl && food.densityGPerMl && (
            <div className="flex flex-wrap justify-between gap-2 rounded-md bg-ink-900 p-2 font-mono text-[11px] text-ink-400">
              <span>Volume: {food.servingVolumeMl} ml</span>
              <span>Density ρ: {food.densityGPerMl} g/ml</span>
              <span>Effective: ~{(food.servingVolumeMl * food.densityGPerMl).toFixed(1)}g</span>
            </div>
          )}
        </div>

        {/* Nutrition Comparison Table: 1-Serving vs Reference 100g */}
        <div className="overflow-hidden rounded-lg border border-ink-800">
          <table className="data-table">
            <thead>
              <tr>
                <th scope="col">Nutrient</th>
                <th scope="col" className="text-right">
                  Per serving ({food.servingWeightG} g)
                </th>
                <th scope="col" className="text-right">
                  Per 100 g
                </th>
              </tr>
            </thead>
            <tbody className="tabular-nums">
              <tr>
                <td className="text-white">Calories</td>
                <td className="text-right">
                  {Math.round(food.standardServingNutrients.calories)} kcal
                </td>
                <td className="text-right">
                  {Math.round(food.referenceNutrients.calories)} kcal
                </td>
              </tr>
              <tr>
                <td>Protein</td>
                <td className="text-right">
                  {food.standardServingNutrients.proteinG} g
                </td>
                <td className="text-right">
                  {food.referenceNutrients.proteinG} g
                </td>
              </tr>
              <tr>
                <td>Carbohydrates</td>
                <td className="text-right">
                  {food.standardServingNutrients.carbsG} g
                </td>
                <td className="text-right">
                  {food.referenceNutrients.carbohydratesG} g
                </td>
              </tr>
              <tr>
                <td>Fat</td>
                <td className="text-right">
                  {food.standardServingNutrients.fatG} g
                </td>
                <td className="text-right">
                  {food.referenceNutrients.fatG} g
                </td>
              </tr>
              <tr>
                <td>Dietary Fiber</td>
                <td className="text-right">
                  {food.standardServingNutrients.fiberG} g
                </td>
                <td className="text-right">
                  {food.referenceNutrients.fiberG} g
                </td>
              </tr>
              <tr>
                <td>Total Sugars</td>
                <td className="text-right">
                  {((food.referenceNutrients.sugarG * food.servingWeightG) / 100).toFixed(1)} g
                </td>
                <td className="text-right">
                  {food.referenceNutrients.sugarG} g
                </td>
              </tr>
              <tr>
                <td>Sodium</td>
                <td className="text-right">
                  {Math.round((food.referenceNutrients.sodiumMg * food.servingWeightG) / 100)} mg
                </td>
                <td className="text-right">
                  {food.referenceNutrients.sodiumMg} mg
                </td>
              </tr>
              <tr>
                <td>Cholesterol</td>
                <td className="text-right">
                  {Math.round((food.referenceNutrients.cholesterolMg * food.servingWeightG) / 100)} mg
                </td>
                <td className="text-right">
                  {food.referenceNutrients.cholesterolMg} mg
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* Provenance */}
        <div className="card-inset space-y-3 p-3.5 text-xs text-ink-400">
          <h4 className="eyebrow">
            Provenance
          </h4>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <div>
              <span className="text-ink-500">Data Source: </span>
              <span className="font-semibold text-ink-300">{food.dataSource}</span>
            </div>
            <div>
              <span className="text-ink-500">Source ID: </span>
              <span className="font-mono text-ink-300">{food.sourceId || 'N/A'}</span>
            </div>
            <div>
              <span className="text-ink-500">Barcode / UPC: </span>
              <span className="font-mono text-ink-300">{food.barcode || 'N/A'}</span>
            </div>
            <div>
              <span className="text-ink-500">Item UUID: </span>
              <span className="font-mono text-ink-400 truncate block" title={food.id}>
                {food.id}
              </span>
            </div>
            <div>
              <span className="text-ink-500">Created At: </span>
              <span className="text-ink-400">
                {new Date(food.createdAt).toLocaleString()}
              </span>
            </div>
            <div>
              <span className="text-ink-500">Updated At: </span>
              <span className="text-ink-400">
                {new Date(food.updatedAt).toLocaleString()}
              </span>
            </div>
          </div>
        </div>

        {/* Close Button */}
        <div className="flex justify-end pt-2">
          <button
            type="button"
            onClick={onClose}
            className="btn btn-secondary"
          >
            Close
          </button>
        </div>
      </div>
    </Modal>
  );
}
