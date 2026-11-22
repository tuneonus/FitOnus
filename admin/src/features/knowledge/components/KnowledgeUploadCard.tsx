'use client';

import React, { useState, useRef } from 'react';
import { UploadCloud, FileText, CheckCircle2, AlertCircle, Loader2, Sparkles, BookOpen } from 'lucide-react';
import { formatFileSize } from '@/features/media/image-upload';
import { knowledgeApi } from '../api';
import type { KnowledgeCategory, DocumentIngestResponse } from '../types';

interface KnowledgeUploadCardProps {
  onIngestSuccess: (response: DocumentIngestResponse) => void;
}

const CATEGORIES: { value: KnowledgeCategory; label: string }[] = [
  { value: 'fitness', label: 'Fitness & Workouts' },
  { value: 'nutrition', label: 'Nutrition & Diet' },
  { value: 'recovery', label: 'Recovery & Sleep' },
  { value: 'app_guide', label: 'FitOnus App Guide' },
];

export function KnowledgeUploadCard({ onIngestSuccess }: KnowledgeUploadCardProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [mode, setMode] = useState<'file' | 'direct'>('file');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [directContent, setDirectContent] = useState('');
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState<KnowledgeCategory>('fitness');
  const [slug, setSlug] = useState('');
  const [author, setAuthor] = useState('');
  const [license, setLicense] = useState('OnusFit Editorial');

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successInfo, setSuccessInfo] = useState<DocumentIngestResponse | null>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setSelectedFile(file);
    setErrorMessage(null);

    // Auto-populate title if empty
    if (!title) {
      const cleanName = file.name
        .replace(/\.[^/.]+$/, '')
        .replace(/[-_]+/g, ' ')
        .trim();
      setTitle(cleanName.charAt(0).toUpperCase() + cleanName.slice(1));
    }
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (!file) return;

    setSelectedFile(file);
    setErrorMessage(null);

    if (!title) {
      const cleanName = file.name
        .replace(/\.[^/.]+$/, '')
        .replace(/[-_]+/g, ' ')
        .trim();
      setTitle(cleanName.charAt(0).toUpperCase() + cleanName.slice(1));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setSuccessInfo(null);

    if (!title.trim()) {
      setErrorMessage('Please enter a document title.');
      return;
    }

    if (mode === 'file' && !selectedFile) {
      setErrorMessage('Please select a PDF, Markdown, or plain text file.');
      return;
    }

    if (mode === 'direct' && directContent.trim().length < 20) {
      setErrorMessage('Direct text content must be at least 20 characters.');
      return;
    }

    setIsSubmitting(true);

    try {
      let res: DocumentIngestResponse;

      if (mode === 'file' && selectedFile) {
        res = await knowledgeApi.uploadFile({
          file: selectedFile,
          title: title.trim(),
          category,
          slug: slug.trim() || undefined,
          author: author.trim() || undefined,
          license: license.trim() || undefined,
        });
      } else {
        res = await knowledgeApi.createDocument({
          title: title.trim(),
          category,
          slug: slug.trim() || undefined,
          content: directContent.trim(),
          author: author.trim() || undefined,
          license: license.trim() || undefined,
        });
      }

      setSuccessInfo(res);
      onIngestSuccess(res);

      // Reset form on success
      setSelectedFile(null);
      setDirectContent('');
      setTitle('');
      setSlug('');
      setAuthor('');
      if (fileInputRef.current) fileInputRef.current.value = '';
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to ingest knowledge document.';
      if (/already exists|conflict|duplicate|409/i.test(msg)) {
        setErrorMessage(
          `${msg} To update chunks or refresh embeddings for an existing document, please use the Reindex button in the documents table below.`
        );
      } else {
        setErrorMessage(msg);
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="rounded-xl border border-ink-800 bg-ink-900/60 p-6 backdrop-blur-sm">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between border-b border-ink-800/80 pb-4 mb-6">
        <div>
          <h2 className="text-lg font-semibold text-white flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-emerald-400" />
            Knowledge Document Ingestion
          </h2>
          <p className="text-xs text-ink-400 mt-1">
            Upload authoritative PDF, Markdown, or plain text documents. Documents are semantically chunked,
            embedded with Gemini (768 dimensions), and stored in pgvector.
          </p>
        </div>

        {/* Toggle Mode */}
        <div className="inline-flex rounded-lg border border-ink-700 bg-ink-950 p-1 text-xs">
          <button
            type="button"
            onClick={() => setMode('file')}
            className={`rounded px-3 py-1 font-medium transition-colors ${
              mode === 'file'
                ? 'bg-emerald-600 text-white shadow-sm'
                : 'text-ink-400 hover:text-white'
            }`}
          >
            File Upload (PDF/TXT/MD)
          </button>
          <button
            type="button"
            onClick={() => setMode('direct')}
            className={`rounded px-3 py-1 font-medium transition-colors ${
              mode === 'direct'
                ? 'bg-emerald-600 text-white shadow-sm'
                : 'text-ink-400 hover:text-white'
            }`}
          >
            Direct Text Input
          </button>
        </div>
      </div>

      {errorMessage && (
        <div className="mb-4 flex items-center gap-3 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-400">
          <AlertCircle className="h-5 w-5 shrink-0" />
          <span>{errorMessage}</span>
        </div>
      )}

      {successInfo && (
        <div className="mb-6 rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-4 text-sm text-emerald-300">
          <div className="flex items-center gap-2 font-semibold text-emerald-400 mb-1">
            <CheckCircle2 className="h-5 w-5" />
            Document Successfully Ingested into pgvector!
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs mt-2 text-ink-300">
            <div>
              <span className="text-ink-400">Title:</span> {successInfo.document.title}
            </div>
            <div>
              <span className="text-ink-400">Slug:</span> {successInfo.document.slug}
            </div>
            <div>
              <span className="text-ink-400">Generated Chunks:</span>{' '}
              <span className="font-semibold text-emerald-400">{successInfo.chunkCount} vector chunks (768-d)</span>
            </div>
          </div>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        {mode === 'file' ? (
          <div>
            <div
              onDragOver={(e) => e.preventDefault()}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className={`flex flex-col items-center justify-center rounded-xl border-2 border-dashed p-6 text-center transition-colors cursor-pointer ${
                selectedFile
                  ? 'border-emerald-500/60 bg-emerald-500/5'
                  : 'border-ink-700 bg-ink-950/40 hover:border-ink-500'
              }`}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,.txt,.md,application/pdf,text/plain,text/markdown"
                onChange={handleFileChange}
                className="hidden"
              />
              {selectedFile ? (
                <div className="flex items-center gap-3">
                  <FileText className="h-8 w-8 text-emerald-400" />
                  <div className="text-left">
                    <p className="text-sm font-medium text-white">{selectedFile.name}</p>
                    <p className="text-xs text-ink-400">{formatFileSize(selectedFile.size)} • Ready for ingestion</p>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-2">
                  <div className="rounded-full bg-ink-800/80 p-3 text-ink-300">
                    <UploadCloud className="h-6 w-6" />
                  </div>
                  <div className="text-sm text-ink-300">
                    <span className="font-semibold text-emerald-400">Click to choose</span> or drag and drop
                  </div>
                  <p className="text-xs text-ink-400">PDF (.pdf), Markdown (.md), or Plain Text (.txt) up to 15 MiB</p>
                </div>
              )}
            </div>
          </div>
        ) : (
          <div>
            <label className="block text-xs font-medium text-ink-300 mb-1">
              Document Text / Markdown Content <span className="text-red-400">*</span>
            </label>
            <textarea
              rows={8}
              value={directContent}
              onChange={(e) => setDirectContent(e.target.value)}
              placeholder="Paste authoritative fitness, nutrition, or recovery text here. Markdown headers, lists, and citations will be semantically chunked..."
              className="w-full rounded-lg border border-ink-700 bg-ink-950 px-3 py-2 text-sm text-white placeholder-ink-500 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 font-mono"
            />
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-ink-300 mb-1">
              Document Title <span className="text-red-400">*</span>
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Hypertrophy Science & Volume Guidelines"
              className="w-full rounded-lg border border-ink-700 bg-ink-950 px-3 py-2 text-sm text-white placeholder-ink-500 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-ink-300 mb-1">
              Category <span className="text-red-400">*</span>
            </label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value as KnowledgeCategory)}
              className="w-full rounded-lg border border-ink-700 bg-ink-950 px-3 py-2 text-sm text-white focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
            >
              {CATEGORIES.map((cat) => (
                <option key={cat.value} value={cat.value}>
                  {cat.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label className="block text-xs font-medium text-ink-400 mb-1">
              Slug (Optional - auto derived if blank)
            </label>
            <input
              type="text"
              value={slug}
              onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, ''))}
              placeholder="e.g. hypertrophy-science-volume"
              className="w-full rounded-lg border border-ink-700 bg-ink-950 px-3 py-2 text-sm text-white placeholder-ink-500 focus:border-emerald-500 focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-ink-400 mb-1">Author / Source</label>
            <input
              type="text"
              value={author}
              onChange={(e) => setAuthor(e.target.value)}
              placeholder="e.g. Dr. Brad Schoenfeld"
              className="w-full rounded-lg border border-ink-700 bg-ink-950 px-3 py-2 text-sm text-white placeholder-ink-500 focus:border-emerald-500 focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-ink-400 mb-1">License / Provenance</label>
            <input
              type="text"
              value={license}
              onChange={(e) => setLicense(e.target.value)}
              placeholder="e.g. CC-BY-4.0 / Public Domain"
              className="w-full rounded-lg border border-ink-700 bg-ink-950 px-3 py-2 text-sm text-white placeholder-ink-500 focus:border-emerald-500 focus:outline-none"
            />
          </div>
        </div>

        <div className="flex justify-end pt-2">
          <button
            type="submit"
            disabled={isSubmitting}
            className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-emerald-500 disabled:opacity-50"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Ingesting & Generating Embeddings…
              </>
            ) : (
              <>
                <BookOpen className="h-4 w-4" />
                Ingest Document into pgvector
              </>
            )}
          </button>
        </div>
      </form>
    </div>
  );
}

