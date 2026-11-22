'use client';

import React, { useState } from 'react';
import {
  Search,
  Sparkles,
  Sliders,
  Code2,
  Check,
  Copy,
  ChevronDown,
  ChevronRight,
  Loader2,
  AlertCircle,
  FileCheck2,
} from 'lucide-react';
import { knowledgeApi } from '../api';
import type { KnowledgeCategory, KnowledgeSearchResponse } from '../types';

const SAMPLE_QUERIES = [
  'How many sets per muscle group per week for hypertrophy?',
  'Optimal daily protein intake for resistance training athletes',
  'Deadlift hip hinge mechanics and lumbar spine bracing cues',
  'Sleep architecture, slow-wave sleep, and athletic recovery',
];

const CATEGORIES: { value: KnowledgeCategory | 'all'; label: string }[] = [
  { value: 'all', label: 'All Categories' },
  { value: 'fitness', label: 'Fitness' },
  { value: 'nutrition', label: 'Nutrition' },
  { value: 'recovery', label: 'Recovery' },
  { value: 'app_guide', label: 'App Guide' },
];

export function KnowledgeSearchTestCard() {
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<KnowledgeCategory | 'all'>('all');
  const [limit, setLimit] = useState(5);
  const [vectorWeight, setVectorWeight] = useState(0.5);
  const [textWeight, setTextWeight] = useState(0.5);
  const [showAdvanced, setShowAdvanced] = useState(false);

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<KnowledgeSearchResponse | null>(null);
  const [copied, setCopied] = useState(false);

  const handleSearch = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!query.trim()) return;

    setIsLoading(true);
    setError(null);

    try {
      const res = await knowledgeApi.search({
        query: query.trim(),
        category: category === 'all' ? undefined : category,
        limit,
        vectorWeight,
        textWeight,
        testRagContext: true,
      });
      setResults(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to execute hybrid search.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleCopyPrompt = () => {
    if (!results?.ragContext?.formattedPromptSection) return;
    navigator.clipboard.writeText(results.ragContext.formattedPromptSection);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-ink-800 bg-ink-900/60 p-6 backdrop-blur-sm">
        <div className="border-b border-ink-800 pb-4 mb-5">
          <h2 className="text-lg font-semibold text-white flex items-center gap-2">
            <Search className="h-5 w-5 text-emerald-400" />
            AI Coach Grounding & Hybrid Retrieval Lab
          </h2>
          <p className="text-xs text-ink-400 mt-1">
            Simulate how the FitOnus AI Coach retrieves knowledge. Executes pgvector dense similarity +
            PostgreSQL full-text search combined via Reciprocal Rank Fusion (RRF).
          </p>
        </div>

        <form onSubmit={handleSearch} className="space-y-4">
          <div className="flex flex-col sm:flex-row gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3.5 top-3 h-4 w-4 text-ink-500" />
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Ask any fitness, nutrition, or biomechanics question…"
                className="w-full rounded-lg border border-ink-700 bg-ink-950 py-2.5 pl-10 pr-4 text-sm text-white placeholder-ink-500 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
              />
            </div>
            <button
              type="submit"
              disabled={isLoading || !query.trim()}
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-emerald-600 px-6 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-emerald-500 disabled:opacity-50 shrink-0"
            >
              {isLoading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Searching…
                </>
              ) : (
                <>
                  <Sparkles className="h-4 w-4" />
                  Test Retrieval
                </>
              )}
            </button>
          </div>

          {/* Sample quick queries */}
          <div className="flex flex-wrap items-center gap-1.5 text-xs text-ink-400">
            <span className="text-ink-500">Quick tests:</span>
            {SAMPLE_QUERIES.map((sample, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => {
                  setQuery(sample);
                }}
                className="rounded-md border border-ink-800 bg-ink-950 px-2 py-1 text-[11px] hover:border-emerald-500/50 hover:text-emerald-300 transition-colors"
              >
                {sample}
              </button>
            ))}
          </div>

          {/* Advanced RRF Parameters Accordion */}
          <div className="border-t border-ink-800/80 pt-3">
            <button
              type="button"
              onClick={() => setShowAdvanced(!showAdvanced)}
              className="flex items-center gap-2 text-xs font-medium text-ink-400 hover:text-white transition-colors"
            >
              <Sliders className="h-3.5 w-3.5" />
              {showAdvanced ? 'Hide Retrieval Tuning' : 'Tune Hybrid Search & RRF Weights'}
              {showAdvanced ? (
                <ChevronDown className="h-3.5 w-3.5" />
              ) : (
                <ChevronRight className="h-3.5 w-3.5" />
              )}
            </button>

            {showAdvanced && (
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 pt-4 mt-2 rounded-lg bg-ink-950 p-4 border border-ink-800/80">
                <div>
                  <label className="block text-xs font-medium text-ink-300 mb-1">
                    Category Filter
                  </label>
                  <select
                    value={category}
                    onChange={(e) => setCategory(e.target.value as KnowledgeCategory | 'all')}
                    className="w-full rounded-md border border-ink-700 bg-ink-900 px-2.5 py-1.5 text-xs text-white"
                  >
                    {CATEGORIES.map((c) => (
                      <option key={c.value} value={c.value}>
                        {c.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-ink-300 mb-1">
                    Top Chunks: <span className="text-emerald-400">{limit}</span>
                  </label>
                  <input
                    type="range"
                    min="1"
                    max="10"
                    step="1"
                    value={limit}
                    onChange={(e) => setLimit(parseInt(e.target.value, 10))}
                    className="w-full accent-emerald-500"
                  />
                  <div className="flex justify-between text-[10px] text-ink-500">
                    <span>1</span>
                    <span>10</span>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-ink-300 mb-1">
                    Dense Vector Weight: <span className="text-emerald-400">{vectorWeight}</span>
                  </label>
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.1"
                    value={vectorWeight}
                    onChange={(e) => setVectorWeight(parseFloat(e.target.value))}
                    className="w-full accent-emerald-500"
                  />
                  <div className="flex justify-between text-[10px] text-ink-500">
                    <span>0 (Off)</span>
                    <span>1.0 (Full)</span>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-ink-300 mb-1">
                    Lexical Text Weight: <span className="text-emerald-400">{textWeight}</span>
                  </label>
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.1"
                    value={textWeight}
                    onChange={(e) => setTextWeight(parseFloat(e.target.value))}
                    className="w-full accent-emerald-500"
                  />
                  <div className="flex justify-between text-[10px] text-ink-500">
                    <span>0 (Off)</span>
                    <span>1.0 (Full)</span>
                  </div>
                </div>
              </div>
            )}
          </div>
        </form>
      </div>

      {error && (
        <div className="flex items-center gap-3 rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-400">
          <AlertCircle className="h-5 w-5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Results Section */}
      {results && (
        <div className="space-y-6">
          {/* Top Chunks Table */}
          <div className="rounded-xl border border-ink-800 bg-ink-900/60 p-6 backdrop-blur-sm">
            <div className="flex items-center justify-between border-b border-ink-800 pb-3 mb-4">
              <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                <FileCheck2 className="h-4 w-4 text-emerald-400" />
                Retrieved & Fused Chunks ({results.chunks.length})
              </h3>
              <span className="text-xs text-ink-400">
                Sorted by Reciprocal Rank Fusion (RRF) Score
              </span>
            </div>

            {results.chunks.length === 0 ? (
              <p className="text-xs text-ink-400 py-6 text-center">
                No chunks matched this query above the similarity threshold.
              </p>
            ) : (
              <div className="space-y-3">
                {results.chunks.map((chunk, idx) => (
                  <div
                    key={chunk.id || idx}
                    className="rounded-lg border border-ink-800 bg-ink-950/70 p-4 space-y-2"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-ink-800/60 pb-2 text-xs">
                      <div className="flex items-center gap-2 font-medium text-white">
                        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-600/20 text-emerald-300 text-[11px] font-bold">
                          {idx + 1}
                        </span>
                        <span>{chunk.documentTitle}</span>
                        <span className="font-mono text-[11px] text-ink-500">
                          [{chunk.documentSlug}:{chunk.chunkIndex}]
                        </span>
                      </div>
                      <div className="flex items-center gap-3 font-mono text-[11px]">
                        {chunk.rrfScore !== undefined && (
                          <span className="text-emerald-400 font-semibold">
                            RRF: {chunk.rrfScore.toFixed(4)}
                          </span>
                        )}
                        {chunk.similarity !== undefined && (
                          <span className="text-cyan-400">
                            Dense: {(chunk.similarity * 100).toFixed(1)}%
                          </span>
                        )}
                        {chunk.textRank !== undefined && (
                          <span className="text-amber-400">
                            Text: {(chunk.textRank * 100).toFixed(1)}%
                          </span>
                        )}
                      </div>
                    </div>
                    <p className="text-xs text-ink-200 leading-relaxed font-sans whitespace-pre-wrap">
                      {chunk.content}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Formatted RAG Prompt Context Preview */}
          {results.ragContext && (
            <div className="rounded-xl border border-ink-800 bg-ink-900/60 p-6 backdrop-blur-sm">
              <div className="flex items-center justify-between border-b border-ink-800 pb-3 mb-4">
                <div>
                  <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                    <Code2 className="h-4 w-4 text-emerald-400" />
                    AI Coach Injected Prompt Section Preview
                  </h3>
                  <p className="text-xs text-ink-400 mt-0.5">
                    Total budget: <span className="font-semibold text-white">{results.ragContext.totalTokens} tokens</span> • {results.ragContext.citations.length} verified citations
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleCopyPrompt}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-ink-700 bg-ink-950 px-3 py-1.5 text-xs font-medium text-ink-300 hover:text-white transition-colors"
                >
                  {copied ? (
                    <>
                      <Check className="h-3.5 w-3.5 text-emerald-400" />
                      Copied!
                    </>
                  ) : (
                    <>
                      <Copy className="h-3.5 w-3.5" />
                      Copy Context
                    </>
                  )}
                </button>
              </div>

              <div className="rounded-lg border border-ink-800 bg-ink-950 p-4 font-mono text-[11px] text-emerald-300 leading-relaxed whitespace-pre-wrap max-h-80 overflow-y-auto">
                {results.ragContext.formattedPromptSection}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
