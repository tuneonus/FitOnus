import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { MessagesSquare, Search } from 'lucide-react-native';
import { useNavigation } from '../../../app/navigation/NavigationContext';
import { Screen } from '../../../shared/components/ui/Screen';
import { TextField } from '../../../shared/components/ui/TextField';
import { EmptyState } from '../../../shared/components/ui/EmptyState';
import { pastConversations } from '../data/conversationsMock';
import { useTheme } from '@/hooks/use-theme';

const groups = ['Today', 'This week', 'Earlier'] as const;

export function CoachHistoryScreen() {
  const { colors } = useTheme();
  const { navigate } = useNavigation();
  const [query, setQuery] = useState('');

  const filtered = pastConversations.filter((c) =>
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

      {filtered.length === 0 ? (
        <EmptyState
          icon={MessagesSquare}
          title="No matching conversations"
          body={`Nothing matches “${query}”. Try a metric like “sleep” or “protein”.`}
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
                  <TouchableOpacity
                    key={c.id}
                    activeOpacity={0.7}
                    onPress={() => navigate('coachConversation', { id: c.id })}
                    style={[
                      styles.row,
                      idx > 0 && {
                        borderTopWidth: 1,
                        borderTopColor: colors.line,
                      },
                    ]}
                  >
                    <View style={styles.rowTop}>
                      <Text
                        style={[styles.rowTitle, { color: colors.ink }]}
                        numberOfLines={1}
                      >
                        {c.title}
                      </Text>
                      <Text style={[styles.rowDate, { color: colors.muted }]}>
                        {c.date}
                      </Text>
                    </View>
                    <Text
                      style={[styles.rowPreview, { color: colors.muted }]}
                      numberOfLines={1}
                    >
                      {c.preview}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          );
        })
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  searchWrap: {
    paddingHorizontal: 16,
    marginBottom: 8,
  },
  groupSection: {
    marginTop: 20,
    paddingHorizontal: 16,
  },
  groupTitle: {
    fontSize: 12,
    fontWeight: '500',
    marginBottom: 8,
    paddingHorizontal: 4,
  },
  card: {
    borderRadius: 24,
    borderWidth: 1,
    overflow: 'hidden',
  },
  row: {
    paddingHorizontal: 16,
    paddingVertical: 14,
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
});

