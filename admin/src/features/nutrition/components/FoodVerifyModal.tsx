'use client';

import React, { useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { ShieldCheck, ShieldAlert, Lock, AlertTriangle } from 'lucide-react';
import type { AdminFood, VerificationStatus, VerifyFoodInput } from '../types';

interface FoodVerifyModalProps {
  isOpen: boolean;
  onClose: () => void;
  food: AdminFood | null;
  onSubmit: (id: string, data: VerifyFoodInput) => Promise<void>;
}

function FoodVerifyForm({
  food,
  onClose,
  onSubmit,
}: {
  food: AdminFood;
  onClose: () => void;
  onSubmit: (id: string, data: VerifyFoodInput) => Promise<void>;
}) {
  const isCustomFood = food.isCustom;

  const [verificationStatus, setVerificationStatus] = useState<VerificationStatus>(
    food.verificationStatus || 'unverified'
  );
  const [dataSource, setDataSource] = useState<
    'usda_fdc' | 'open_food_facts' | 'manufacturer_label'
  >(
    food.dataSource === 'manufacturer_label' || food.dataSource === 'open_food_facts'
      ? food.dataSource
      : 'usda_fdc'
  );
  const [sourceId, setSourceId] = useState(food.sourceId || '');

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isCustomFood) {
      setError(
        'Security Policy Violation: Private custom food cannot be promoted to global catalog without explicit user consent.'
      );
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      await onSubmit(food.id, {
        verificationStatus,
        dataSource: verificationStatus === 'verified' ? dataSource : undefined,
        sourceId: sourceId.trim() || null,
      });
      onClose();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Failed to update food verification status.'
      );
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

      {/* Security Alert: Private custom food restriction */}
      {isCustomFood ? (
        <div className="rounded-xl border border-amber-500/30 bg-amber-950/20 p-4 text-amber-300 space-y-2">
          <div className="flex items-center gap-2 font-semibold text-amber-200">
            <Lock className="h-4 w-4 text-amber-400" />
            <span>User Custom Food Promotion Disabled</span>
          </div>
          <p className="text-[11px] text-amber-300/80 leading-relaxed">
            This item was authored by user{' '}
            <span className="font-mono text-amber-200">{food.createdBy}</span> as a
            private custom food. Promoting custom foods to the global verified
            catalog is disabled because explicit user licensing consent and safe
            ownership cloning are not supported.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          <div>
            <label className="block font-semibold text-slate-300 mb-1.5">
              Verification Status
            </label>
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => setVerificationStatus('verified')}
                className={`flex flex-col items-center justify-center p-3 rounded-xl border text-center transition-all ${
                  verificationStatus === 'verified'
                    ? 'border-emerald-500/60 bg-emerald-500/10 text-emerald-300 font-semibold'
                    : 'border-slate-800 bg-slate-950 text-slate-400 hover:bg-slate-900'
                }`}
              >
                <ShieldCheck className="h-5 w-5 mb-1 text-emerald-400" />
                <span>Verified</span>
              </button>

              <button
                type="button"
                onClick={() => setVerificationStatus('unverified')}
                className={`flex flex-col items-center justify-center p-3 rounded-xl border text-center transition-all ${
                  verificationStatus === 'unverified'
                    ? 'border-amber-500/60 bg-amber-500/10 text-amber-300 font-semibold'
                    : 'border-slate-800 bg-slate-950 text-slate-400 hover:bg-slate-900'
                }`}
              >
                <ShieldAlert className="h-5 w-5 mb-1 text-amber-400" />
                <span>Unverified</span>
              </button>

              <button
                type="button"
                onClick={() => setVerificationStatus('rejected')}
                className={`flex flex-col items-center justify-center p-3 rounded-xl border text-center transition-all ${
                  verificationStatus === 'rejected'
                    ? 'border-rose-500/60 bg-rose-500/10 text-rose-300 font-semibold'
                    : 'border-slate-800 bg-slate-950 text-slate-400 hover:bg-slate-900'
                }`}
              >
                <AlertTriangle className="h-5 w-5 mb-1 text-rose-400" />
                <span>Rejected</span>
              </button>
            </div>
          </div>

          {verificationStatus === 'verified' && (
            <>
              <div>
                <label className="block font-semibold text-slate-300 mb-1">
                  Authoritative Data Source
                </label>
                <select
                  value={dataSource}
                  onChange={(e) =>
                    setDataSource(
                      e.target.value as
                        | 'usda_fdc'
                        | 'open_food_facts'
                        | 'manufacturer_label'
                    )
                  }
                  className="w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-white focus:border-teal-500 focus:outline-none"
                >
                  <option value="usda_fdc">USDA FoodData Central</option>
                  <option value="manufacturer_label">
                    Manufacturer Nutrition Facts
                  </option>
                  <option value="open_food_facts">Open Food Facts</option>
                </select>
              </div>

              <div>
                <label className="block font-semibold text-slate-300 mb-1">
                  Source Identification (e.g. FDC ID)
                </label>
                <input
                  type="text"
                  value={sourceId}
                  onChange={(e) => setSourceId(e.target.value)}
                  placeholder="e.g. 171265"
                  className="w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-white placeholder-slate-600 focus:border-teal-500 focus:outline-none font-mono"
                />
              </div>
            </>
          )}
        </div>
      )}

      <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-800">
        <button
          type="button"
          onClick={onClose}
          disabled={isSubmitting}
          className="rounded-xl border border-slate-800 bg-slate-900 px-4 py-2 text-slate-300 hover:bg-slate-800 transition-colors"
        >
          Cancel
        </button>
        {!isCustomFood && (
          <button
            type="submit"
            disabled={isSubmitting}
            className="rounded-xl bg-gradient-to-r from-teal-500 to-emerald-500 px-5 py-2 font-semibold text-slate-950 hover:brightness-110 shadow-lg shadow-teal-500/20 disabled:opacity-50 transition-all"
          >
            {isSubmitting ? 'Saving...' : 'Update Status'}
          </button>
        )}
      </div>
    </form>
  );
}

export function FoodVerifyModal({
  isOpen,
  onClose,
  food,
  onSubmit,
}: FoodVerifyModalProps) {
  if (!food) return null;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Manage Verification Status"
      description={`Update status and catalog provenance for "${food.name}"`}
      maxWidth="md"
    >
      <FoodVerifyForm food={food} onClose={onClose} onSubmit={onSubmit} />
    </Modal>
  );
}
