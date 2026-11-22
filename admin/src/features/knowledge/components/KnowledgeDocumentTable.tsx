'use client';

import React, { useState } from 'react';
import {
  FileText,
  Trash2,
  Eye,
  Layers,
  Loader2,
  FolderOpen,
  RefreshCw,
  Edit2,
  CheckCircle,
  AlertTriangle,
  XCircle,
} from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { TablePagination } from '@/components/ui/TablePagination';
import { knowledgeApi } from '../api';
import type {
  KnowledgeCategory,
  KnowledgeDocument,
  KnowledgeDocumentDetail,
  UpdateDocumentMetadataInput,
} from '../types';

interface KnowledgeDocumentTableProps {
  documents: KnowledgeDocument[];
  isLoading: boolean;
  onDocumentDeleted: (idOrSlug: string) => void;
  onDocumentUpdated: (doc: KnowledgeDocument) => void;
  selectedCategory: KnowledgeCategory | 'all';
  onSelectCategory: (cat: KnowledgeCategory | 'all') => void;
  page: number;
  totalPages: number;
  total: number;
  pageSize: number;
  onPageChange: (page: number) => void;
}

const CATEGORY_COLORS: Record<KnowledgeCategory, { bg: string; text: string; border: string }> = {
  fitness: { bg: 'bg-emerald-500/10', text: 'text-emerald-400', border: 'border-emerald-500/20' },
  nutrition: { bg: 'bg-amber-500/10', text: 'text-amber-400', border: 'border-amber-500/20' },
  recovery: { bg: 'bg-cyan-500/10', text: 'text-cyan-400', border: 'border-cyan-500/20' },
  app_guide: { bg: 'bg-indigo-500/10', text: 'text-indigo-400', border: 'border-indigo-500/20' },
};

const CATEGORIES: { value: KnowledgeCategory | 'all'; label: string }[] = [
  { value: 'all', label: 'All Categories' },
  { value: 'fitness', label: 'Fitness' },
  { value: 'nutrition', label: 'Nutrition' },
  { value: 'recovery', label: 'Recovery' },
  { value: 'app_guide', label: 'App Guide' },
];

export function KnowledgeDocumentTable({
  documents,
  isLoading,
  onDocumentDeleted,
  onDocumentUpdated,
  selectedCategory,
  onSelectCategory,
  page,
  totalPages,
  total,
  pageSize,
  onPageChange,
}: KnowledgeDocumentTableProps) {
  const [docToDelete, setDocToDelete] = useState<KnowledgeDocument | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const [activeDocDetail, setActiveDocDetail] = useState<KnowledgeDocumentDetail | null>(null);
  const [isLoadingDetail, setIsLoadingDetail] = useState(false);
  const [detailModalOpen, setDetailModalOpen] = useState(false);

  // Reindexing state
  const [reindexingSlug, setReindexingSlug] = useState<string | null>(null);

  // Toggling status state
  const [togglingSlug, setTogglingSlug] = useState<string | null>(null);

  // Edit metadata modal state
  const [editDoc, setEditDoc] = useState<KnowledgeDocument | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editCategory, setEditCategory] = useState<KnowledgeCategory>('fitness');
  const [editAuthor, setEditAuthor] = useState('');
  const [editLicense, setEditLicense] = useState('');
  const [isSavingEdit, setIsSavingEdit] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  const handleOpenDetail = async (doc: KnowledgeDocument) => {
    setIsLoadingDetail(true);
    setDetailModalOpen(true);
    try {
      const full = await knowledgeApi.getDocument(doc.slug, true);
      setActiveDocDetail(full);
    } catch {
      setActiveDocDetail({ ...doc, content: 'Failed to load content details.', chunks: [] });
    } finally {
      setIsLoadingDetail(false);
    }
  };

  const handleToggleActive = async (doc: KnowledgeDocument) => {
    setTogglingSlug(doc.slug);
    try {
      const updated = await knowledgeApi.toggleDocumentStatus(doc.slug, !doc.isActive);
      onDocumentUpdated(updated);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to update document status.');
    } finally {
      setTogglingSlug(null);
    }
  };

  const handleReindex = async (doc: KnowledgeDocument) => {
    setReindexingSlug(doc.slug);
    try {
      const res = await knowledgeApi.reindexDocument(doc.slug);
      onDocumentUpdated(res.document);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to reindex document.');
    } finally {
      setReindexingSlug(null);
    }
  };

  const handleOpenEdit = (doc: KnowledgeDocument) => {
    setEditDoc(doc);
    setEditTitle(doc.title);
    setEditCategory(doc.category);
    setEditAuthor(doc.author || '');
    setEditLicense(doc.license || '');
    setEditError(null);
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editDoc) return;
    if (!editTitle.trim()) {
      setEditError('Title is required.');
      return;
    }

    setIsSavingEdit(true);
    setEditError(null);
    try {
      const updates: UpdateDocumentMetadataInput = {
        title: editTitle.trim(),
        category: editCategory,
        author: editAuthor.trim() || undefined,
        license: editLicense.trim() || undefined,
      };
      const updated = await knowledgeApi.updateDocumentMetadata(editDoc.slug, updates);
      onDocumentUpdated(updated);
      setEditDoc(null);
    } catch (err) {
      setEditError(err instanceof Error ? err.message : 'Failed to update document metadata.');
    } finally {
      setIsSavingEdit(false);
    }
  };

  const handleDeleteConfirm = async () => {
    if (!docToDelete) return;
    setIsDeleting(true);
    try {
      await knowledgeApi.deleteDocument(docToDelete.slug);
      onDocumentDeleted(docToDelete.slug);
      setDocToDelete(null);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to delete document.');
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="rounded-xl border border-ink-800 bg-ink-900/60 backdrop-blur-sm overflow-hidden">
      {/* Category filter tabs */}
      <div className="flex flex-wrap items-center justify-between border-b border-ink-800 p-4 gap-3">
        <div className="flex items-center gap-1.5 overflow-x-auto">
          {CATEGORIES.map((cat) => (
            <button
              key={cat.value}
              onClick={() => onSelectCategory(cat.value)}
              className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                selectedCategory === cat.value
                  ? 'bg-emerald-600/20 text-emerald-300 border border-emerald-500/30'
                  : 'text-ink-400 hover:bg-ink-800 hover:text-white'
              }`}
            >
              {cat.label}
            </button>
          ))}
        </div>
        <div className="text-xs text-ink-400">
          Total: <span className="font-semibold text-white">{total}</span> documents
        </div>
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="flex h-48 items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-emerald-400" />
        </div>
      ) : documents.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-center text-ink-400">
          <FolderOpen className="h-10 w-10 text-ink-600 mb-2" />
          <p className="text-sm font-medium text-white">No knowledge documents found</p>
          <p className="text-xs text-ink-500 max-w-sm mt-1">
            Upload your first workout, nutrition, or recovery document above to ground the AI Coach.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-ink-800 bg-ink-950/40 text-ink-400">
              <tr>
                <th className="px-4 py-3 font-medium">Document / Slug</th>
                <th className="px-4 py-3 font-medium">Category</th>
                <th className="px-4 py-3 font-medium">Status & Retrieval</th>
                <th className="px-4 py-3 font-medium">Author & License</th>
                <th className="px-4 py-3 font-medium">Updated</th>
                <th className="px-4 py-3 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-800/60">
              {documents.map((doc) => {
                const badge = CATEGORY_COLORS[doc.category] || CATEGORY_COLORS.fitness;
                const isReindexing = reindexingSlug === doc.slug;
                const isToggling = togglingSlug === doc.slug;

                return (
                  <tr key={doc.id} className="hover:bg-ink-800/30 transition-colors">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <FileText className="h-4 w-4 text-emerald-400 shrink-0" />
                        <div>
                          <div className="font-medium text-white">{doc.title}</div>
                          <div className="font-mono text-[11px] text-ink-400">{doc.slug}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-block rounded-full border px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${badge.bg} ${badge.text} ${badge.border}`}
                      >
                        {doc.category.replace('_', ' ')}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-col gap-1 items-start">
                        {/* Active / Disabled toggle */}
                        <button
                          type="button"
                          onClick={() => handleToggleActive(doc)}
                          disabled={isToggling}
                          title={doc.isActive ? 'Click to disable retrieval' : 'Click to enable retrieval'}
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium transition-colors ${
                            doc.isActive
                              ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 hover:bg-emerald-500/25'
                              : 'bg-zinc-800 text-zinc-400 border border-zinc-700 hover:bg-zinc-700'
                          }`}
                        >
                          {isToggling ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            <span
                              className={`h-1.5 w-1.5 rounded-full ${
                                doc.isActive ? 'bg-emerald-400' : 'bg-zinc-500'
                              }`}
                            />
                          )}
                          {doc.isActive ? 'Active' : 'Disabled'}
                        </button>

                        {/* Processing Status badge */}
                        {doc.processingStatus === 'ready' && (
                          <span className="inline-flex items-center gap-1 text-[10px] text-emerald-400">
                            <CheckCircle className="h-3 w-3" /> Ready
                          </span>
                        )}
                        {doc.processingStatus === 'processing' && (
                          <span className="inline-flex items-center gap-1 text-[10px] text-amber-400">
                            <Loader2 className="h-3 w-3 animate-spin" /> Ingesting
                          </span>
                        )}
                        {doc.processingStatus === 'failed' && (
                          <span
                            className="inline-flex items-center gap-1 text-[10px] text-red-400"
                            title={doc.processingError || 'Ingestion failed'}
                          >
                            <AlertTriangle className="h-3 w-3" /> Ingestion Error
                          </span>
                        )}

                        {/* Reindex Status badge */}
                        {doc.reindexStatus === 'processing' && (
                          <span className="inline-flex items-center gap-1 text-[10px] text-amber-400">
                            <Loader2 className="h-3 w-3 animate-spin" /> Reindexing...
                          </span>
                        )}
                        {doc.reindexStatus === 'failed' && (
                          <span
                            className="inline-flex items-center gap-1 text-[10px] text-amber-500 font-medium cursor-help"
                            title={`Last reindex attempt failed: ${doc.reindexError || 'error'}. Existing chunks remain fully available for retrieval.`}
                          >
                            <AlertTriangle className="h-3 w-3" /> Reindex Failed
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-ink-300">
                      <div>{doc.author || 'OnusFit Editorial'}</div>
                      <div className="text-[11px] text-ink-500">{doc.license || 'Proprietary'}</div>
                    </td>
                    <td className="px-4 py-3 text-ink-400">
                      <div>
                        {new Date(doc.updatedAt).toLocaleDateString(undefined, {
                          year: 'numeric',
                          month: 'short',
                          day: 'numeric',
                        })}
                      </div>
                      <div className="text-[10px] text-ink-500">v{doc.version}</div>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="inline-flex items-center gap-1">
                        {/* Reindex action */}
                        <button
                          type="button"
                          onClick={() => handleReindex(doc)}
                          disabled={isReindexing || doc.reindexStatus === 'processing'}
                          title={
                            doc.reindexStatus === 'processing'
                              ? 'Document is currently being reindexed'
                              : 'Reindex document (re-chunk and re-embed without data loss)'
                          }
                          className="rounded p-1 text-ink-400 hover:bg-ink-800 hover:text-emerald-400 transition-colors disabled:opacity-50"
                        >
                          <RefreshCw
                            className={`h-4 w-4 ${
                              isReindexing || doc.reindexStatus === 'processing'
                                ? 'animate-spin text-emerald-400'
                                : ''
                            }`}
                          />
                        </button>

                        {/* Edit metadata action */}
                        <button
                          type="button"
                          onClick={() => handleOpenEdit(doc)}
                          title="Edit document metadata"
                          className="rounded p-1 text-ink-400 hover:bg-ink-800 hover:text-white transition-colors"
                        >
                          <Edit2 className="h-4 w-4" />
                        </button>

                        {/* View details action */}
                        <button
                          type="button"
                          onClick={() => handleOpenDetail(doc)}
                          title="View document chunks & text"
                          className="rounded p-1 text-ink-400 hover:bg-ink-800 hover:text-white transition-colors"
                        >
                          <Eye className="h-4 w-4" />
                        </button>

                        {/* Delete action */}
                        <button
                          type="button"
                          onClick={() => setDocToDelete(doc)}
                          title="Delete document and vector chunks"
                          className="rounded p-1 text-ink-400 hover:bg-red-500/20 hover:text-red-400 transition-colors"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination Footer */}
      <TablePagination
        page={page}
        totalPages={totalPages}
        total={total}
        pageSize={pageSize}
        onPageChange={onPageChange}
        itemLabel="documents"
      />

      {/* Edit Metadata Modal */}
      <Modal
        isOpen={Boolean(editDoc)}
        onClose={() => setEditDoc(null)}
        title={`Edit Metadata: ${editDoc?.slug}`}
        maxWidth="md"
      >
        <form onSubmit={handleSaveEdit} className="space-y-4 text-xs">
          {editError && (
            <div className="rounded border border-red-500/30 bg-red-500/10 p-2 text-red-400 flex items-center gap-2">
              <XCircle className="h-4 w-4 shrink-0" />
              <span>{editError}</span>
            </div>
          )}

          <div>
            <label className="block text-ink-300 font-medium mb-1">
              Document Title <span className="text-red-400">*</span>
            </label>
            <input
              type="text"
              value={editTitle}
              onChange={(e) => setEditTitle(e.target.value)}
              className="w-full rounded-lg border border-ink-700 bg-ink-950 px-3 py-2 text-white text-xs focus:border-emerald-500 focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-ink-300 font-medium mb-1">
              Category <span className="text-red-400">*</span>
            </label>
            <select
              value={editCategory}
              onChange={(e) => setEditCategory(e.target.value as KnowledgeCategory)}
              className="w-full rounded-lg border border-ink-700 bg-ink-950 px-3 py-2 text-white text-xs focus:border-emerald-500 focus:outline-none"
            >
              {CATEGORIES.filter((c) => c.value !== 'all').map((cat) => (
                <option key={cat.value} value={cat.value}>
                  {cat.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-ink-300 font-medium mb-1">Author / Source</label>
            <input
              type="text"
              value={editAuthor}
              onChange={(e) => setEditAuthor(e.target.value)}
              className="w-full rounded-lg border border-ink-700 bg-ink-950 px-3 py-2 text-white text-xs focus:border-emerald-500 focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-ink-300 font-medium mb-1">License / Provenance</label>
            <input
              type="text"
              value={editLicense}
              onChange={(e) => setEditLicense(e.target.value)}
              className="w-full rounded-lg border border-ink-700 bg-ink-950 px-3 py-2 text-white text-xs focus:border-emerald-500 focus:outline-none"
            />
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t border-ink-800">
            <button
              type="button"
              onClick={() => setEditDoc(null)}
              className="rounded-lg border border-ink-700 px-4 py-2 text-ink-300 hover:bg-ink-800 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSavingEdit}
              className="rounded-lg bg-emerald-600 px-4 py-2 font-medium text-white hover:bg-emerald-500 transition-colors disabled:opacity-50"
            >
              {isSavingEdit ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Detail / Chunks Modal */}
      <Modal
        isOpen={detailModalOpen}
        onClose={() => setDetailModalOpen(false)}
        title={activeDocDetail ? activeDocDetail.title : 'Document Details'}
        maxWidth="lg"
      >
        {isLoadingDetail || !activeDocDetail ? (
          <div className="flex h-48 items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-emerald-400" />
          </div>
        ) : (
          <div className="space-y-4 max-h-[75vh] overflow-y-auto pr-2 text-xs">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 rounded-lg bg-ink-950 p-3 border border-ink-800 text-ink-300">
              <div>
                <span className="text-ink-500 block">Category:</span>
                <span className="font-medium text-white">{activeDocDetail.category}</span>
              </div>
              <div>
                <span className="text-ink-500 block">Status:</span>
                <span className="font-medium text-white">
                  {activeDocDetail.isActive ? 'Active' : 'Disabled'} ({activeDocDetail.processingStatus})
                </span>
              </div>
              <div>
                <span className="text-ink-500 block">Author:</span>
                <span className="font-medium text-white">{activeDocDetail.author || 'N/A'}</span>
              </div>
              <div>
                <span className="text-ink-500 block">Vector Chunks:</span>
                <span className="font-semibold text-emerald-400">
                  {activeDocDetail.chunks?.length ?? 0} Chunks (768-d)
                </span>
              </div>
            </div>

            <div>
              <h4 className="font-semibold text-white mb-2 flex items-center gap-1.5 text-sm">
                <Layers className="h-4 w-4 text-emerald-400" />
                Semantically Extracted Chunks ({activeDocDetail.chunks?.length ?? 0})
              </h4>
              <div className="space-y-2">
                {activeDocDetail.chunks && activeDocDetail.chunks.length > 0 ? (
                  activeDocDetail.chunks.map((chunk) => (
                    <div
                      key={chunk.id}
                      className="rounded-lg border border-ink-800 bg-ink-950/70 p-3 text-ink-300"
                    >
                      <div className="flex items-center justify-between font-mono text-[11px] text-ink-500 mb-1 border-b border-ink-800/60 pb-1">
                        <span className="text-emerald-400 font-semibold">Chunk #{chunk.chunkIndex}</span>
                        <span>{chunk.tokenCount} tokens • 768-dim Vector</span>
                      </div>
                      <p className="whitespace-pre-wrap font-sans text-xs leading-relaxed text-ink-200">
                        {chunk.content}
                      </p>
                    </div>
                  ))
                ) : (
                  <p className="text-ink-500 italic">No vector chunks loaded for this document.</p>
                )}
              </div>
            </div>

            <div className="border-t border-ink-800 pt-3">
              <h4 className="font-semibold text-white mb-2 text-sm">Raw Extracted Content</h4>
              <div className="rounded-lg border border-ink-800 bg-ink-950 p-3 font-mono text-ink-300 max-h-48 overflow-y-auto whitespace-pre-wrap leading-relaxed text-[11px]">
                {activeDocDetail.content}
              </div>
            </div>
          </div>
        )}
      </Modal>

      {/* Delete Confirmation */}
      <ConfirmDialog
        isOpen={Boolean(docToDelete)}
        title="Delete Knowledge Document?"
        description={`Are you sure you want to delete "${docToDelete?.title}" (${docToDelete?.slug})? All associated vector embeddings in pgvector and full-text indexes will be permanently removed.`}
        confirmLabel="Delete Document"
        tone="danger"
        isBusy={isDeleting}
        onConfirm={handleDeleteConfirm}
        onClose={() => setDocToDelete(null)}
      />
    </div>
  );
}
