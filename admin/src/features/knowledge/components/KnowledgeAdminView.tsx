'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { BookOpen, Database, Layers } from 'lucide-react';
import { AdminLayout } from '@/components/layout/AdminLayout';
import { StatsCard } from '@/components/ui/StatsCard';
import { TabBar } from '@/components/ui/TabBar';
import { useToast } from '@/context/ToastContext';
import { KnowledgeUploadCard } from './KnowledgeUploadCard';
import { KnowledgeDocumentTable } from './KnowledgeDocumentTable';
import { KnowledgeSearchTestCard } from './KnowledgeSearchTestCard';
import { knowledgeApi } from '../api';
import type { KnowledgeCategory, KnowledgeDocument, DocumentIngestResponse } from '../types';

export function KnowledgeAdminView() {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState<'documents' | 'search'>('documents');
  const [documents, setDocuments] = useState<KnowledgeDocument[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<KnowledgeCategory | 'all'>('all');
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Pagination state
  const [page, setPage] = useState(1);
  const pageSize = 20;
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);

  const fetchDocuments = useCallback(async () => {
    try {
      const res = await knowledgeApi.listDocuments({
        category: selectedCategory === 'all' ? undefined : selectedCategory,
        page,
        limit: pageSize,
      });
      setDocuments(res.documents);
      const metaTotal = res.meta?.total ?? res.documents.length;
      setTotal(metaTotal);
      setTotalPages(res.meta?.totalPages ?? Math.max(1, Math.ceil(metaTotal / pageSize)));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to fetch knowledge documents.', {
        title: 'Error loading documents',
      });
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [selectedCategory, page, pageSize, toast]);

  useEffect(() => {
    let isMounted = true;
    knowledgeApi
      .listDocuments({
        category: selectedCategory === 'all' ? undefined : selectedCategory,
        page,
        limit: pageSize,
      })
      .then((res) => {
        if (isMounted) {
          setDocuments(res.documents);
          const metaTotal = res.meta?.total ?? res.documents.length;
          setTotal(metaTotal);
          setTotalPages(res.meta?.totalPages ?? Math.max(1, Math.ceil(metaTotal / pageSize)));
          setIsLoading(false);
        }
      })
      .catch((err) => {
        if (isMounted) {
          toast.error(err instanceof Error ? err.message : 'Failed to fetch knowledge documents.', {
            title: 'Error loading documents',
          });
          setIsLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [selectedCategory, page, pageSize, toast]);

  const handleCategorySelect = (cat: KnowledgeCategory | 'all') => {
    setSelectedCategory(cat);
    setPage(1); // Reset to page 1 on filter change
  };

  const handleRefresh = () => {
    setIsRefreshing(true);
    fetchDocuments();
  };

  const handleIngestSuccess = (res: DocumentIngestResponse) => {
    toast.success(`"${res.document.title}" was split into ${res.chunkCount} vector chunks and stored in pgvector.`, {
      title: 'Document Ingested',
    });
    fetchDocuments();
  };

  const handleDocumentDeleted = (idOrSlug: string) => {
    setDocuments((prev) => prev.filter((d) => d.slug !== idOrSlug && d.id !== idOrSlug));
    setTotal((prev) => Math.max(0, prev - 1));
    toast.success('Document and its vector embeddings were removed.', {
      title: 'Document Deleted',
    });
  };

  const handleDocumentUpdated = (updatedDoc: KnowledgeDocument) => {
    setDocuments((prev) =>
      prev.map((d) => (d.id === updatedDoc.id || d.slug === updatedDoc.slug ? updatedDoc : d))
    );
    toast.success(`"${updatedDoc.title}" was successfully updated.`, {
      title: 'Document Updated',
    });
  };

  // Derive stats
  const activeDocsCount = documents.filter((d) => d.isActive).length;
  const categoriesCount = new Set(documents.map((d) => d.category)).size;

  return (
    <AdminLayout
      title="Knowledge Base (RAG)"
      subtitle="Ingest PDF, Markdown, and text files into PostgreSQL pgvector (768-d Gemini embeddings) to ground the FitOnus AI Coach."
      onRefresh={handleRefresh}
      isRefreshing={isRefreshing}
    >
      <div className="space-y-6">
        {/* Stats Row */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <StatsCard
            title="Total Documents"
            value={total}
            icon={<BookOpen className="h-5 w-5" />}
            subtitle={`${activeDocsCount} active on page • ${total} total`}
            accent="emerald"
          />
          <StatsCard
            title="Active Categories"
            value={`${categoriesCount} of 4`}
            icon={<Layers className="h-5 w-5" />}
            subtitle="Fitness, Nutrition, Recovery, Guides"
            accent="teal"
          />
          <StatsCard
            title="pgvector Index"
            value="768-dim HNSW"
            icon={<Database className="h-5 w-5" />}
            subtitle="Cosine similarity <=> & RRF Hybrid"
            accent="cyan"
          />
        </div>

        {/* Tab Navigation */}
        <TabBar
          tabs={[
            { id: 'documents', label: 'Documents & Ingestion', count: total },
            { id: 'search', label: 'AI Coach Retrieval Lab' },
          ]}
          active={activeTab}
          onChange={(tab) => setActiveTab(tab)}
          ariaLabel="Knowledge base sections"
        />

        {/* Tab Content */}
        {activeTab === 'documents' ? (
          <div className="space-y-6">
            <KnowledgeUploadCard onIngestSuccess={handleIngestSuccess} />
            <KnowledgeDocumentTable
              documents={documents}
              isLoading={isLoading}
              onDocumentDeleted={handleDocumentDeleted}
              onDocumentUpdated={handleDocumentUpdated}
              selectedCategory={selectedCategory}
              onSelectCategory={handleCategorySelect}
              page={page}
              totalPages={totalPages}
              total={total}
              pageSize={pageSize}
              onPageChange={setPage}
            />
          </div>
        ) : (
          <KnowledgeSearchTestCard />
        )}
      </div>
    </AdminLayout>
  );
}
