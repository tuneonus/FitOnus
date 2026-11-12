import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { MessagesSquare, Search, Trash2 } from 'lucide-react-native';
import { useNavigation } from '../../../app/navigation/NavigationContext';
import { Screen } from '../../../shared/components/ui/Screen';
import { TextField } from '../../../shared/components/ui/TextField';
import { EmptyState } from '../../../shared/components/ui/EmptyState';
import { ConfirmDialog } from '../../../shared/components/ui/ConfirmDialog';
import { showToast } from '../../../shared/stores/toastStore';
import { CoachApi } from '../services/coach-api';
import type { ConversationSummary } from '../types/coach';
import { useTheme } from '@/hooks/use-theme';

const groups = ['Today', 'This week', 'Earlier'] as const;

interface GroupedConvo extends ConversationSummary {
  group: 'Today' | 'This week' | 'Earlier';
  formattedDate: string;
}

function classifyConversation(c: ConversationSummary): GroupedConvo {
  const d = new Date(c.updatedAt || c.createdAt);
  const now = new Date();
  const diffDays = Math.floor((now.getTime() - d.getTime()) / (1000 * 60 * 60 * 24));

  let group: 'Today' | 'This week' | 'Earlier' = 'Earlier';
  if (diffDays === 0 && d.getDate() === now.getDate()) {
    group = 'Today';
  } else if (diffDays < 7) {
    group = 'This week';
  }

  const timeStr = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  const formattedDate = group === 'Today' ? timeStr : d.toLocaleDateString([], { month: 'short', day: 'numeric' });

  return {
    ...c,
    group,
    formattedDate,
  };
}

export function CoachHistoryScreen() {
  const { colors } = useTheme();
  const { navigate } = useNavigation();
  const [query, setQuery] = useState('');
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);

  const fetchConversations = useCallback(async () => {
    try {
      setLoading(true);
      setLoadFailed(false);
      const res = await CoachApi.listConversations(1, 50);
      setConversations(res?.conversations || []);
    } catch {
      setLoadFailed(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchConversations();
  }, [fetchConversations]);

  const handleDelete = async () => {
    if (!deletingId) return;
    try {
      await CoachApi.deleteConversation(deletingId);
      setConversations((prev) => prev.filter((c) => c.id !== deletingId));
      showToast({ message: 'Conversation deleted' });
    } catch {
      showToast({ tone: 'error', message: 'Couldn’t delete this conversation. Please try again.' });
    } finally {
      setDeletingId(null);
    }
  };

  const classified = conversations.map(classifyConversation);
  const filtered = classified.filter((c) =>
    `${c.title} ${c.preview}`.toLowerCase().includes(query.toLowerCase())
  );

  return (
    <Screen title="Conversations">
      <View style={styles.searchWrap}>
        <TextField
          label="Search conversations"
          hideLabel
          placeholder="Search conversations"
          value={query}
          onChangeText={setQuery}
          trailing={<Search size={18} color={colors.muted} />}
        />
      </View>

      {loading ? (
        <View style={styles.loadingBox}>
          <ActivityIndicator size="small" color={colors.accentStrong} />
          <Text style={[styles.loadingText, { color: colors.muted }]}>Loading conversations…</Text>
        </View>
      ) : loadFailed && conversations.length === 0 ? (
        <EmptyState
          icon={MessagesSquare}
          title="Couldn’t load conversations"
          body="Check your connection and try again. Your history hasn’t been removed."
          actionLabel="Retry"
          onAction={() => {
            void fetchConversations();
          }}
        />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={MessagesSquare}
          title={query ? 'No matching conversations' : 'No conversations yet'}
          body={
            query
              ? `Nothing matches “${query}”. Try a topic like “workout” or “protein”.`
              : 'Chat with your AI Coach and your conversation history will be saved here.'
          }
        />
      ) : (
        groups.map((g) => {
          const items = filtered.filter((c) => c.group === g);
          if (!items.length) return null;

          return (
            <View key={g} style={styles.groupSection}>
              <Text style={[styles.groupTitle, { color: colors.muted }]}>{g}</Text>
              <View
                style={[
                  styles.card,
                  {
                    backgroundColor: colors.surface,
                    borderColor: colors.line,
                  },
                ]}
              >
                {items.map((c, idx) => (
                  <View
                    key={c.id}
                    style={[
                      styles.row,
                      idx > 0 && {
                        borderTopWidth: 1,
                        borderTopColor: colors.line,
                      },
                    ]}
                  >
                    <TouchableOpacity
                      activeOpacity={0.7}
                      onPress={() => navigate('coachConversation', { id: c.id })}
                      style={styles.rowMain}
                    >
                      <View style={styles.rowTop}>
                        <Text
                          style={[styles.rowTitle, { color: colors.ink }]}
                          numberOfLines={1}
                        >
                          {c.title}
                        </Text>
                        <Text style={[styles.rowDate, { color: colors.muted }]}>
                          {c.formattedDate}
                        </Text>
                      </View>
                      <Text
                        style={[styles.rowPreview, { color: colors.muted }]}
                        numberOfLines={1}
                      >
                        {c.preview || 'No preview available'}
                      </Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      activeOpacity={0.7}
                      onPress={() => setDeletingId(c.id)}
                      style={styles.deleteBtn}
                      accessibilityLabel="Delete conversation"
                    >
                      <Trash2 size={16} color={colors.muted} />
                    </TouchableOpacity>
                  </View>
                ))}
              </View>
            </View>
          );
        })
      )}

      <ConfirmDialog
        open={Boolean(deletingId)}
        title="Delete conversation?"
        message="This conversation will be permanently removed from your history."
        confirmLabel="Delete"
        destructive
        onCancel={() => setDeletingId(null)}
        onConfirm={handleDelete}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  searchWrap: {
    marginBottom: 8,
  },
  loadingBox: {
    padding: 32,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  loadingText: {
    fontSize: 13,
  },
  groupSection: {
    marginTop: 20,
  },
  groupTitle: {
    fontSize: 12,
    fontWeight: '500',
    marginBottom: 8,
    paddingHorizontal: 4,
  },
  card: {
    borderRadius: 20,
    borderWidth: 1,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  rowMain: {
    flex: 1,
    marginRight: 8,
  },
  rowTop: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: 12,
  },
  rowTitle: {
    fontSize: 15,
    fontWeight: '600',
    flex: 1,
  },
  rowDate: {
    fontSize: 12,
  },
  rowPreview: {
    fontSize: 13,
    marginTop: 2,
  },
  deleteBtn: {
    padding: 8,
    borderRadius: 12,
  },
});
