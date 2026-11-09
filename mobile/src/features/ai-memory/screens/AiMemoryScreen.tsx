import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { Brain, Lock, Pencil, Trash2 } from 'lucide-react-native';
import { Screen } from '../../../shared/components/ui/Screen';
import { Toggle } from '../../../shared/components/ui/Toggle';
import { Button } from '../../../shared/components/ui/Button';
import { Badge } from '../../../shared/components/ui/Badge';
import { BottomSheet } from '../../../shared/components/ui/BottomSheet';
import { ConfirmDialog } from '../../../shared/components/ui/ConfirmDialog';
import { EmptyState } from '../../../shared/components/ui/EmptyState';
import { TextField } from '../../../shared/components/ui/TextField';
import { showToast } from '../../../shared/stores/toastStore';
import { MemoryItem, useMemoryStore } from '../store/memoryStore';
import { memoryCategories, memoryCategoryOrder } from '../constants/memoryCategories';
import { useTheme } from '@/hooks/use-theme';

export function AiMemoryScreen() {
  const { colors } = useTheme();
  const {
    enabled,
    items,
    suggestions,
    loading,
    fetchMemories,
    setEnabled,
    updateItem,
    deleteItem,
    restoreItem,
    clearAll,
    approveSuggestion,
    dismissSuggestion,
  } = useMemoryStore();

  useEffect(() => {
    fetchMemories();
  }, [fetchMemories]);

  const [editing, setEditing] = useState<MemoryItem | null>(null);
  const [draft, setDraft] = useState('');
  const [confirmClear, setConfirmClear] = useState(false);

  const startEdit = (m: MemoryItem) => {
    setEditing(m);
    setDraft(m.text);
  };

  const saveEdit = () => {
    if (!editing) return;
    updateItem(editing.id, draft);
    setEditing(null);
    showToast({ message: 'Memory updated' });
  };

  const remove = (m: MemoryItem) => {
    deleteItem(m.id);
    setEditing(null);
    showToast({
      message: 'Memory deleted',
      actionLabel: 'Undo',
      onAction: () => restoreItem(m),
    });
  };

  return (
    <Screen title="AI memory">
      <View style={styles.content}>
        {/* Hero Banner */}
        <View style={[styles.heroCard, { backgroundColor: colors.hero }]}>
          <View style={styles.heroTop}>
            <Brain size={22} color={colors.accent} style={{ marginTop: 2 }} />
            <View style={styles.heroText}>
              <Text style={[styles.heroTitle, { color: colors.heroInk }]}>
                Coach memory
              </Text>
              <Text style={[styles.heroDesc, { color: colors.heroMuted }]}>
                What your coach remembers between conversations. Only things you’ve approved are saved. You can edit or delete anything.
              </Text>
            </View>
            <Toggle checked={enabled} onChange={setEnabled} />
          </View>
          <Text
            style={[
              styles.heroFooter,
              { color: colors.heroMuted, borderTopColor: `${colors.heroInk}15` },
            ]}
          >
            {items.length} memories · stored encrypted · never used for ads
          </Text>
        </View>

        {!enabled && (
          <Text style={[styles.pausedHint, { color: colors.muted }]}>
            Memory is paused. Your coach won’t read or save memories, so answers will be less personal. Saved items stay until you delete them.
          </Text>
        )}

        {/* Suggestions / Waiting for OK */}
        {suggestions.length > 0 && enabled && (
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: colors.ink }]}>
              Waiting for your OK
            </Text>
            <View style={styles.suggestionsList}>
              {suggestions.map((s) => (
                <View
                  key={s.id}
                  style={[
                    styles.suggestionCard,
                    {
                      backgroundColor: colors.surface,
                      borderColor: colors.line,
                    },
                  ]}
                >
                  <View style={styles.sugHeader}>
                    <Text style={[styles.sugCategory, { color: colors.muted }]}>
                      {memoryCategories[s.category]?.label || s.category}
                    </Text>
                    {s.sensitive && (
                      <Badge tone="warn">
                        <Lock size={11} color={colors.warn} /> Sensitive
                      </Badge>
                    )}
                  </View>
                  <Text style={[styles.sugText, { color: colors.ink }]}>
                    {s.text}
                  </Text>
                  <Text style={[styles.sugFrom, { color: colors.muted }]}>
                    From {s.from}
                  </Text>
                  {s.sensitive && (
                    <Text style={[styles.sugSensitiveHint, { color: colors.muted }]}>
                      Health information. Saving it lets the coach factor it into advice — it won’t diagnose or treat anything.
                    </Text>
                  )}
                  <View style={styles.sugButtons}>
                    <Button
                      size="sm"
                      variant="secondary"
                      title="Don’t save"
                      onPress={() => {
                        dismissSuggestion(s.id);
                        showToast({ message: 'Not saved' });
                      }}
                    />
                    <Button
                      size="sm"
                      title="Save"
                      onPress={() => {
                        approveSuggestion(s.id);
                        showToast({ message: 'Saved to memory' });
                      }}
                    />
                  </View>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* Saved Memories List */}
        {loading && items.length === 0 ? (
          <View style={{ padding: 32, alignItems: 'center', justifyContent: 'center' }}>
            <ActivityIndicator size="small" color={colors.accent} />
          </View>
        ) : items.length === 0 ? (
          <EmptyState
            icon={Brain}
            title="No memories yet"
            body="Tell your coach about goals, food preferences or injuries. It will ask before saving anything."
          />
        ) : (
          memoryCategoryOrder.map((cat) => {
            const list = items.filter((i) => i.category === cat);
            if (!list.length) return null;
            const meta = memoryCategories[cat];
            const Icon = meta.icon;

            return (
              <View key={cat} style={styles.section}>
                <View style={styles.categoryHead}>
                  <Icon size={14} color={colors.muted} />
                  <Text style={[styles.categoryTitle, { color: colors.muted }]}>
                    {meta.label}
                  </Text>
                </View>
                <View
                  style={[
                    styles.memoryCard,
                    {
                      backgroundColor: colors.surface,
                      borderColor: colors.line,
                    },
                  ]}
                >
                  {list.map((m, idx) => (
                    <TouchableOpacity
                      key={m.id}
                      activeOpacity={0.7}
                      onPress={() => startEdit(m)}
                      style={[
                        styles.memoryRow,
                        idx > 0 && {
                          borderTopWidth: 1,
                          borderTopColor: colors.line,
                        },
                      ]}
                    >
                      <View style={styles.memoryTextCol}>
                        <Text style={[styles.memoryItemText, { color: colors.ink }]}>
                          {m.text}
                        </Text>
                        <View style={styles.memoryMetaRow}>
                          <Text style={[styles.memorySource, { color: colors.muted }]}>
                            {m.source}
                          </Text>
                          {m.sensitive && (
                            <Badge tone="warn">
                              <Lock size={10} color={colors.warn} /> Sensitive
                            </Badge>
                          )}
                        </View>
                      </View>
                      <Pencil size={15} color={colors.muted} style={{ marginTop: 2 }} />
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            );
          })
        )}

        {/* Clear All Button */}
        {items.length > 0 && (
          <View style={styles.clearSection}>
            <Button
              variant="danger"
              title="Clear all memories"
              onPress={() => setConfirmClear(true)}
            />
          </View>
        )}
      </View>

      {/* Edit Memory BottomSheet */}
      <BottomSheet
        visible={Boolean(editing)}
        onClose={() => setEditing(null)}
        title="Edit memory"
      >
        <View style={styles.sheetBody}>
          <TextField
            label="Memory details"
            value={draft}
            onChangeText={setDraft}
            multiline
            style={{ minHeight: 90 }}
          />
          <View style={styles.sheetButtons}>
            {editing && (
              <Button
                variant="danger"
                title="Delete memory"
                onPress={() => remove(editing)}
              />
            )}
            <Button title="Save changes" onPress={saveEdit} />
          </View>
        </View>
      </BottomSheet>

      {/* Confirm Clear All Dialog */}
      <ConfirmDialog
        visible={confirmClear}
        title="Clear all memories?"
        message="This will delete all saved preferences, health notes and goals your coach has remembered. This cannot be undone."
        confirmLabel="Clear all"
        confirmTone="bad"
        onConfirm={() => {
          clearAll();
          setConfirmClear(false);
          showToast({ message: 'All memories cleared' });
        }}
        onCancel={() => setConfirmClear(false)}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: 16,
    paddingBottom: 40,
    gap: 20,
  },
  heroCard: {
    borderRadius: 28,
    padding: 20,
  },
  heroTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  heroText: {
    flex: 1,
  },
  heroTitle: {
    fontSize: 16,
    fontWeight: '600',
  },
  heroDesc: {
    marginTop: 4,
    fontSize: 13,
    lineHeight: 18,
  },
  heroFooter: {
    marginTop: 16,
    borderTopWidth: 1,
    paddingTop: 12,
    fontSize: 12,
    fontVariant: ['tabular-nums'],
  },
  pausedHint: {
    fontSize: 13,
    lineHeight: 18,
    paddingHorizontal: 8,
  },
  section: {},
  sectionTitle: {
    fontSize: 17,
    fontWeight: '600',
    marginBottom: 8,
    paddingHorizontal: 4,
  },
  suggestionsList: {
    gap: 10,
  },
  suggestionCard: {
    borderRadius: 24,
    borderWidth: 1,
    borderStyle: 'dashed',
    padding: 16,
  },
  sugHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  sugCategory: {
    fontSize: 12,
    fontWeight: '500',
  },
  sugText: {
    marginTop: 6,
    fontSize: 15,
    fontWeight: '500',
    lineHeight: 20,
  },
  sugFrom: {
    marginTop: 4,
    fontSize: 12,
  },
  sugSensitiveHint: {
    marginTop: 8,
    fontSize: 12.5,
    lineHeight: 16,
  },
  sugButtons: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 12,
  },
  categoryHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 8,
    paddingHorizontal: 4,
  },
  categoryTitle: {
    fontSize: 13,
    fontWeight: '500',
  },
  memoryCard: {
    borderRadius: 24,
    borderWidth: 1,
    overflow: 'hidden',
  },
  memoryRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    padding: 16,
    gap: 12,
  },
  memoryTextCol: {
    flex: 1,
  },
  memoryItemText: {
    fontSize: 14.5,
    lineHeight: 20,
  },
  memoryMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 4,
  },
  memorySource: {
    fontSize: 12,
  },
  clearSection: {
    alignItems: 'center',
    marginTop: 8,
  },
  sheetBody: {
    paddingHorizontal: 20,
    paddingBottom: 24,
    gap: 16,
  },
  sheetButtons: {
    gap: 10,
  },
});
