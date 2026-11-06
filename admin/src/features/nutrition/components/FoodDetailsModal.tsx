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
      <div className="space-y-4 text-xs">
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
          <div className="rounded-xl border border-purple-500/30 bg-purple-950/20 p-3 text-purple-300 flex items-start gap-2.5">
            <Lock className="h-4 w-4 shrink-0 text-purple-400 mt-0.5" />
            <div className="space-y-1">
              <p className="font-semibold text-purple-200">
                Private User-Owned Food Record
              </p>
              <p className="text-[11px] text-purple-300/80 leading-relaxed">
                This custom food is scoped exclusively to user tenant{' '}
                <span className="font-mono text-purple-200">{food.createdBy}</span>.
                It is never exposed globally. To preserve user consent and privacy,
                promotion to the global catalog is restricted.
              </p>
            </div>
          </div>
        )}

        {/* Serving Specification Card */}
        <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3 space-y-2">
          <div className="flex items-center justify-between text-slate-300">
            <span className="font-semibold flex items-center gap-1.5 text-teal-400">
              <Scale className="h-4 w-4" />
              Serving Specification
            </span>
            <span className="font-mono text-white">
              {food.servingSize} {food.servingUnit} = {food.servingWeightG}g
            </span>
          </div>

          {food.servingVolumeMl && food.densityGPerMl && (
            <div className="text-[11px] text-slate-400 bg-slate-900/60 rounded-lg p-2 flex justify-between font-mono">
              <span>Volume: {food.servingVolumeMl} ml</span>
              <span>Density ρ: {food.densityGPerMl} g/ml</span>
              <span>Effective: ~{(food.servingVolumeMl * food.densityGPerMl).toFixed(1)}g</span>
            </div>
          )}
        </div>

        {/* Nutrition Comparison Table: 1-Serving vs Reference 100g */}
        <div className="rounded-xl border border-slate-800 bg-slate-950/60 overflow-hidden">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-slate-800 bg-slate-900/50 text-slate-400">
                <th className="py-2.5 px-4 font-semibold">Nutrient</th>
                <th className="py-2.5 px-4 font-semibold text-teal-300 text-right">
                  Per Serving ({food.servingWeightG}g)
                </th>
                <th className="py-2.5 px-4 font-semibold text-slate-400 text-right">
                  Per 100g (Basis)
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/40 font-mono text-[11px]">
              <tr>
                <td className="py-2 px-4 text-white font-bold">Calories</td>
                <td className="py-2 px-4 text-teal-300 font-bold text-right">
                  {Math.round(food.standardServingNutrients.calories)} kcal
                </td>
                <td className="py-2 px-4 text-slate-300 text-right">
                  {Math.round(food.referenceNutrients.calories)} kcal
                </td>
              </tr>
              <tr>
                <td className="py-2 px-4 text-blue-300">Protein</td>
                <td className="py-2 px-4 text-blue-300 text-right">
                  {food.standardServingNutrients.proteinG} g
                </td>
                <td className="py-2 px-4 text-slate-400 text-right">
                  {food.referenceNutrients.proteinG} g
                </td>
              </tr>
              <tr>
                <td className="py-2 px-4 text-amber-300">Carbohydrates</td>
                <td className="py-2 px-4 text-amber-300 text-right">
                  {food.standardServingNutrients.carbsG} g
                </td>
                <td className="py-2 px-4 text-slate-400 text-right">
                  {food.referenceNutrients.carbohydratesG} g
                </td>
              </tr>
              <tr>
                <td className="py-2 px-4 text-rose-300">Fat</td>
                <td className="py-2 px-4 text-rose-300 text-right">
                  {food.standardServingNutrients.fatG} g
                </td>
                <td className="py-2 px-4 text-slate-400 text-right">
                  {food.referenceNutrients.fatG} g
                </td>
              </tr>
              <tr>
                <td className="py-2 px-4 text-slate-400">Dietary Fiber</td>
                <td className="py-2 px-4 text-slate-300 text-right">
                  {food.standardServingNutrients.fiberG} g
                </td>
                <td className="py-2 px-4 text-slate-400 text-right">
                  {food.referenceNutrients.fiberG} g
                </td>
              </tr>
              <tr>
                <td className="py-2 px-4 text-slate-400">Total Sugars</td>
                <td className="py-2 px-4 text-slate-300 text-right">
                  {((food.referenceNutrients.sugarG * food.servingWeightG) / 100).toFixed(1)} g
                </td>
                <td className="py-2 px-4 text-slate-400 text-right">
                  {food.referenceNutrients.sugarG} g
                </td>
              </tr>
              <tr>
                <td className="py-2 px-4 text-slate-400">Sodium</td>
                <td className="py-2 px-4 text-slate-300 text-right">
                  {Math.round((food.referenceNutrients.sodiumMg * food.servingWeightG) / 100)} mg
                </td>
                <td className="py-2 px-4 text-slate-400 text-right">
                  {food.referenceNutrients.sodiumMg} mg
                </td>
              </tr>
              <tr>
                <td className="py-2 px-4 text-slate-400">Cholesterol</td>
                <td className="py-2 px-4 text-slate-300 text-right">
                  {Math.round((food.referenceNutrients.cholesterolMg * food.servingWeightG) / 100)} mg
                </td>
                <td className="py-2 px-4 text-slate-400 text-right">
                  {food.referenceNutrients.cholesterolMg} mg
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* Provenance & Metadata */}
        <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3 space-y-2 text-[11px] text-slate-400">
          <h4 className="font-semibold text-slate-300 uppercase tracking-wider text-[10px]">
            Provenance & Metadata
          </h4>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <span className="text-slate-500">Data Source: </span>
              <span className="font-semibold text-slate-300">{food.dataSource}</span>
            </div>
            <div>
              <span className="text-slate-500">Source ID: </span>
              <span className="font-mono text-slate-300">{food.sourceId || 'N/A'}</span>
            </div>
            <div>
              <span className="text-slate-500">Barcode / UPC: </span>
              <span className="font-mono text-slate-300">{food.barcode || 'N/A'}</span>
            </div>
            <div>
              <span className="text-slate-500">Item UUID: </span>
              <span className="font-mono text-slate-400 truncate block" title={food.id}>
                {food.id}
              </span>
            </div>
            <div>
              <span className="text-slate-500">Created At: </span>
              <span className="text-slate-400">
                {new Date(food.createdAt).toLocaleString()}
              </span>
            </div>
            <div>
              <span className="text-slate-500">Updated At: </span>
              <span className="text-slate-400">
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
            className="rounded-xl border border-slate-800 bg-slate-900 px-4 py-2 text-slate-300 hover:bg-slate-800 transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </Modal>
  );
}
