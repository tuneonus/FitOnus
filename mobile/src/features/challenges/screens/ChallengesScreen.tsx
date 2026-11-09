import React, { useEffect, useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import {
  Trophy,
  Award,
  Medal,
  Flame,
  CheckCircle2,
  Lock,
  Clock,
  Sparkles,
  History,
  Coins,
  ChevronRight,
} from 'lucide-react-native';
import { Screen } from '@/shared/components/ui/Screen';
import { SegmentedControl } from '@/shared/components/ui/SegmentedControl';
import { ProgressBar } from '@/shared/components/ui/ProgressBar';
import { Button } from '@/shared/components/ui/Button';
import { Badge } from '@/shared/components/ui/Badge';
import { EmptyState } from '@/shared/components/ui/EmptyState';
import { Chip } from '@/shared/components/ui/Chip';
import { useTheme } from '@/hooks/use-theme';
import { useChallengesStore } from '../store/challengesStore';
import {
  formatMetricProgress,
  type ActiveChallengeItemView,
  type BadgeView,
  type ChallengeCadence,
  type PointsLedgerView,
} from '../types/challenges';

export function ChallengesScreen() {
  const { colors } = useTheme();

  const {
    activeChallenges,
    history,
    profile,
    badges,
    pointsHistory,
    isLoading,
    isRefreshing,
    isEnrolling,
    isClaiming,
    error,
    fetchActiveChallenges,
    fetchChallengeHistory,
    fetchGamificationSummary,
    fetchBadges,
    fetchPointsHistory,
    refreshAll,
    enrollInChallenge,
    claimReward,
  } = useChallengesStore();

  const [activeTab, setActiveTab] = useState<'challenges' | 'badges' | 'history' | 'points'>('challenges');
  const [cadenceFilter, setCadenceFilter] = useState<'all' | ChallengeCadence>('all');
  const [badgeFilter, setBadgeFilter] = useState<'all' | 'earned' | 'locked'>('all');
  const [historyStatusFilter, setHistoryStatusFilter] = useState<'all' | 'completed' | 'active' | 'failed'>('all');

  useEffect(() => {
    fetchActiveChallenges();
    fetchGamificationSummary();
    fetchBadges();
  }, [fetchActiveChallenges, fetchGamificationSummary, fetchBadges]);

  useEffect(() => {
    if (activeTab === 'history') {
      fetchChallengeHistory();
    } else if (activeTab === 'points') {
      fetchPointsHistory();
    }
  }, [activeTab, fetchChallengeHistory, fetchPointsHistory]);

  const onRefresh = useCallback(() => {
    refreshAll();
  }, [refreshAll]);

  // Filtered challenges
  const filteredChallenges = useMemo(() => {
    if (cadenceFilter === 'all') return activeChallenges;
    return activeChallenges.filter((item) => item.challenge.cadence === cadenceFilter);
  }, [activeChallenges, cadenceFilter]);

  // Filtered badges
  const filteredBadges = useMemo(() => {
    if (badgeFilter === 'all') return badges;
    if (badgeFilter === 'earned') return badges.filter((b) => b.earned);
    return badges.filter((b) => !b.earned);
  }, [badges, badgeFilter]);

  // Filtered history
  const filteredHistory = useMemo(() => {
    if (historyStatusFilter === 'all') return history;
    return history.filter((item) => item.enrollment?.status === historyStatusFilter);
  }, [history, historyStatusFilter]);

  const handleEnroll = async (occurrenceId: string) => {
    try {
      await enrollInChallenge(occurrenceId);
    } catch {
      // Handled in store
    }
  };

  const handleClaim = async (occurrenceId: string) => {
    try {
      await claimReward(occurrenceId);
    } catch {
      // Handled in store
    }
  };

  return (
    <Screen
      title="Challenges & Badges"
      subtitle="Compete, earn rewards and level up"
      refreshControl={
        <RefreshControl
          refreshing={isRefreshing}
          onRefresh={onRefresh}
          tintColor={colors.accent}
          colors={[colors.accent]}
        />
      }
    >
      <View style={styles.container}>
        {/* Gamification Level & Points Summary Banner */}
        <View style={[styles.summaryCard, { backgroundColor: colors.surface, borderColor: colors.line }]}>
          <View style={styles.summaryTopRow}>
            <View style={styles.summaryLevelWrap}>
              <View style={[styles.levelIconPill, { backgroundColor: `${colors.accent}20` }]}>
                <Sparkles size={18} color={colors.accentStrong} />
              </View>
              <View>
                <Text style={[styles.levelTitleText, { color: colors.ink }]}>
                  {profile ? `Level ${profile.currentLevel} · ${profile.levelTitle}` : 'Level 1 · Rookie'}
                </Text>
                <Text style={[styles.levelSubText, { color: colors.muted }]}>
                  {profile
                    ? `${profile.pointsToNextLevel.toLocaleString()} pts to Level ${profile.currentLevel + 1}`
                    : 'Earn points to level up'}
                </Text>
              </View>
            </View>
            <View style={styles.pointsWrap}>
              <Text style={[styles.pointsValText, { color: colors.accentStrong }]}>
                {profile ? profile.totalPoints.toLocaleString() : '0'}
              </Text>
              <Text style={[styles.pointsLabelText, { color: colors.muted }]}>Total Points</Text>
            </View>
          </View>

          {/* Level Progress Bar */}
          <View style={styles.summaryProgressSection}>
            <ProgressBar
              progress={profile ? Math.min(Math.max(profile.levelProgressRatio, 0), 1) : 0}
              color={colors.accentStrong}
              height={8}
            />
          </View>

          {/* Quick Counter Stats */}
          <View style={[styles.summaryStatsRow, { borderTopColor: colors.line }]}>
            <View style={styles.statCol}>
              <Text style={[styles.statNum, { color: colors.ink }]}>
                {profile ? profile.challengesWon : 0}
              </Text>
              <Text style={[styles.statLabel, { color: colors.muted }]}>Challenges Won</Text>
            </View>
            <View style={[styles.statDivider, { backgroundColor: colors.line }]} />
            <View style={styles.statCol}>
              <Text style={[styles.statNum, { color: colors.ink }]}>
                {profile ? profile.badgesCount : 0}
              </Text>
              <Text style={[styles.statLabel, { color: colors.muted }]}>Badges Earned</Text>
            </View>
          </View>
        </View>

        {/* Main Segmented Control */}
        <SegmentedControl
          options={[
            { value: 'challenges', label: `Challenges (${activeChallenges.length})` },
            { value: 'badges', label: `Badges (${badges.length})` },
            { value: 'history', label: 'History' },
            { value: 'points', label: 'Points' },
          ]}
          value={activeTab}
          onChange={(val) => setActiveTab(val as typeof activeTab)}
        />

        {/* ================================================================= */}
        {/* TAB 1: ACTIVE CHALLENGES                                          */}
        {/* ================================================================= */}
        {activeTab === 'challenges' && (
          <View style={styles.tabContent}>
            {/* Filter Chips */}
            <View style={styles.filterRow}>
              {(['all', 'daily', 'weekly', 'special'] as const).map((cad) => (
                <Chip
                  key={cad}
                  label={cad === 'all' ? 'All' : `${cad.charAt(0).toUpperCase()}${cad.slice(1)}`}
                  selected={cadenceFilter === cad}
                  onPress={() => setCadenceFilter(cad)}
                />
              ))}
            </View>

            {error && activeChallenges.length === 0 ? (
              <EmptyState
                icon={Trophy}
                title="Unable to load challenges"
                body={error}
                actionLabel="Try again"
                onAction={onRefresh}
              />
            ) : filteredChallenges.length === 0 ? (
              <EmptyState
                icon={Trophy}
                title={cadenceFilter === 'all' ? 'No active challenges' : `No ${cadenceFilter} challenges`}
                body="Check back soon! New challenges are published periodically."
              />
            ) : (
              <View style={styles.challengeList}>
                {filteredChallenges.map((item) => {
                  const { challenge, occurrence, enrollment, enrolled, canClaim } = item;
                  const inEnrollFlight = isEnrolling[occurrence.id];
                  const inClaimFlight = isClaiming[occurrence.id];

                  const progressInfo = enrollment
                    ? formatMetricProgress(
                        challenge.metricType,
                        enrollment.currentProgress,
                        enrollment.targetValue,
                      )
                    : null;

                  const isCompleted = enrollment?.status === 'completed' || enrollment?.status === 'claimed';
                  const isClaimed = enrollment?.status === 'claimed';

                  return (
                    <View
                      key={occurrence.id}
                      style={[
                        styles.challengeCard,
                        {
                          backgroundColor: colors.surface,
                          borderColor: isCompleted ? colors.accent : colors.line,
                        },
                      ]}
                    >
                      {/* Top Metadata Header */}
                      <View style={styles.challengeTop}>
                        <View style={styles.challengeBadgeRow}>
                          <Badge tone={challenge.cadence === 'daily' ? 'good' : 'neutral'}>
                            {challenge.cadence.toUpperCase()}
                          </Badge>
                          <Badge tone="neutral">{challenge.category.toUpperCase()}</Badge>
                        </View>
                        <View style={styles.rewardPill}>
                          <Coins size={14} color={colors.accentStrong} />
                          <Text style={[styles.rewardPointsText, { color: colors.accentStrong }]}>
                            +{challenge.rewardPoints} pts
                          </Text>
                        </View>
                      </View>

                      {/* Title & Description */}
                      <Text style={[styles.challengeTitle, { color: colors.ink }]}>
                        {challenge.title}
                      </Text>
                      <Text style={[styles.challengeDescription, { color: colors.muted }]}>
                        {challenge.description}
                      </Text>

                      {/* Period / Occurrence Info */}
                      <View style={styles.periodRow}>
                        <Clock size={13} color={colors.muted} />
                        <Text style={[styles.periodText, { color: colors.muted }]}>
                          Active until {new Date(occurrence.periodEnd).toLocaleDateString(undefined, {
                            month: 'short',
                            day: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </Text>
                      </View>

                      {/* Progress or Enrollment Status */}
                      {enrolled && enrollment ? (
                        <View style={styles.progressContainer}>
                          <View style={styles.progressTextRow}>
                            <Text style={[styles.progressValText, { color: colors.ink }]}>
                              {progressInfo?.currentStr} / {progressInfo?.targetStr} {progressInfo?.unit}
                            </Text>
                            <Text style={[styles.progressPctText, { color: colors.muted }]}>
                              {Math.round(enrollment.progressRatio * 100)}%
                            </Text>
                          </View>
                          <ProgressBar
                            progress={Math.min(Math.max(enrollment.progressRatio, 0), 1)}
                            color={isCompleted ? colors.accentStrong : colors.accent}
                            height={6}
                          />

                          {/* Action Button: Claim or Status */}
                          <View style={styles.cardActionRow}>
                            {canClaim ? (
                              <Button
                                title={inClaimFlight ? 'Claiming...' : `Claim +${challenge.rewardPoints} Points`}
                                variant="primary"
                                loading={Boolean(inClaimFlight)}
                                disabled={Boolean(inClaimFlight)}
                                onPress={() => handleClaim(occurrence.id)}
                              />
                            ) : isClaimed ? (
                              <View style={styles.statusSuccessRow}>
                                <CheckCircle2 size={16} color={colors.accentStrong} />
                                <Text style={[styles.claimedText, { color: colors.accentStrong }]}>
                                  Reward Claimed
                                </Text>
                              </View>
                            ) : (
                              <Text style={[styles.inProgressNotice, { color: colors.muted }]}>
                                Complete requirements before challenge ends to claim reward.
                              </Text>
                            )}
                          </View>
                        </View>
                      ) : (
                        <View style={styles.cardActionRow}>
                          <Button
                            title={inEnrollFlight ? 'Joining...' : 'Join Challenge'}
                            variant="primary"
                            loading={Boolean(inEnrollFlight)}
                            disabled={Boolean(inEnrollFlight)}
                            onPress={() => handleEnroll(occurrence.id)}
                          />
                        </View>
                      )}
                    </View>
                  );
                })}
              </View>
            )}
          </View>
        )}

        {/* ================================================================= */}
        {/* TAB 2: BADGES CATALOG                                             */}
        {/* ================================================================= */}
        {activeTab === 'badges' && (
          <View style={styles.tabContent}>
            <View style={styles.filterRow}>
              {(['all', 'earned', 'locked'] as const).map((filter) => (
                <Chip
                  key={filter}
                  label={
                    filter === 'all'
                      ? `All (${badges.length})`
                      : filter === 'earned'
                        ? `Earned (${badges.filter((b) => b.earned).length})`
                        : `Locked (${badges.filter((b) => !b.earned).length})`
                  }
                  selected={badgeFilter === filter}
                  onPress={() => setBadgeFilter(filter)}
                />
              ))}
            </View>

            {filteredBadges.length === 0 ? (
              <EmptyState
                icon={Medal}
                title={badgeFilter === 'earned' ? 'No badges earned yet' : 'No badges found'}
                body={
                  badgeFilter === 'earned'
                    ? 'Complete workouts, log streaks, and conquer challenges to unlock your first badge.'
                    : 'Check back soon for new milestone badges.'
                }
              />
            ) : (
              <View style={styles.badgesGrid}>
                {filteredBadges.map((badge) => (
                  <View
                    key={badge.id}
                    style={[
                      styles.badgeCard,
                      {
                        backgroundColor: colors.surface,
                        borderColor: badge.earned ? colors.accent : colors.line,
                        borderStyle: badge.earned ? 'solid' : 'dashed',
                      },
                    ]}
                  >
                    <View style={styles.badgeIconWrap}>
                      {badge.earned ? (
                        <View style={[styles.badgeIconBubble, { backgroundColor: `${colors.accent}25` }]}>
                          <Medal size={28} color={colors.accentStrong} />
                        </View>
                      ) : (
                        <View style={[styles.badgeIconBubble, { backgroundColor: `${colors.line}60` }]}>
                          <Lock size={22} color={colors.muted} />
                        </View>
                      )}
                      <Badge tone={badge.earned ? 'good' : 'neutral'}>
                        {badge.tier.toUpperCase()}
                      </Badge>
                    </View>

                    <Text style={[styles.badgeName, { color: colors.ink }]} numberOfLines={1}>
                      {badge.name}
                    </Text>
                    <Text style={[styles.badgeDesc, { color: colors.muted }]} numberOfLines={2}>
                      {badge.description}
                    </Text>

                    <View style={styles.badgeFooter}>
                      <Text style={[styles.badgePoints, { color: colors.accentStrong }]}>
                        +{badge.pointsValue} pts
                      </Text>
                      {badge.earned && badge.earnedAt && (
                        <Text style={[styles.badgeEarnedDate, { color: colors.muted }]}>
                          {new Date(badge.earnedAt).toLocaleDateString(undefined, {
                            month: 'short',
                            day: 'numeric',
                          })}
                        </Text>
                      )}
                    </View>
                  </View>
                ))}
              </View>
            )}
          </View>
        )}

        {/* ================================================================= */}
        {/* TAB 3: CHALLENGE HISTORY                                          */}
        {/* ================================================================= */}
        {activeTab === 'history' && (
          <View style={styles.tabContent}>
            <View style={styles.filterRow}>
              {(['all', 'completed', 'active', 'failed'] as const).map((status) => (
                <Chip
                  key={status}
                  label={status === 'all' ? 'All' : `${status.charAt(0).toUpperCase()}${status.slice(1)}`}
                  selected={historyStatusFilter === status}
                  onPress={() => setHistoryStatusFilter(status)}
                />
              ))}
            </View>

            {filteredHistory.length === 0 ? (
              <EmptyState
                icon={History}
                title="No challenge history yet"
                body="Enrolled and completed challenges will appear here once finalized."
              />
            ) : (
              <View style={styles.challengeList}>
                {filteredHistory.map((item) => (
                  <View
                    key={item.occurrence.id}
                    style={[styles.historyCard, { backgroundColor: colors.surface, borderColor: colors.line }]}
                  >
                    <View style={styles.historyCardHeader}>
                      <Text style={[styles.historyTitle, { color: colors.ink }]}>
                        {item.challenge.title}
                      </Text>
                      <Badge
                        tone={
                          item.enrollment?.status === 'claimed' || item.enrollment?.status === 'completed'
                            ? 'good'
                            : 'neutral'
                        }
                      >
                        {item.enrollment?.status ? item.enrollment.status.toUpperCase() : 'CLOSED'}
                      </Badge>
                    </View>
                    <Text style={[styles.historyMeta, { color: colors.muted }]}>
                      Ended {new Date(item.occurrence.periodEnd).toLocaleDateString()}
                    </Text>
                    {item.enrollment && (
                      <View style={styles.historyProgressRow}>
                        <Text style={[styles.historyProgText, { color: colors.ink }]}>
                          Progress: {Math.round(item.enrollment.progressRatio * 100)}%
                        </Text>
                        <Text style={[styles.historyRewardText, { color: colors.accentStrong }]}>
                          +{item.challenge.rewardPoints} pts
                        </Text>
                      </View>
                    )}
                  </View>
                ))}
              </View>
            )}
          </View>
        )}

        {/* ================================================================= */}
        {/* TAB 4: POINTS HISTORY LEDGER                                      */}
        {/* ================================================================= */}
        {activeTab === 'points' && (
          <View style={styles.tabContent}>
            {pointsHistory.length === 0 ? (
              <EmptyState
                icon={Coins}
                title="No points transactions yet"
                body="Earn points by completing daily and weekly challenges, maintaining habit streaks, and finishing workouts."
              />
            ) : (
              <View style={styles.ledgerList}>
                {pointsHistory.map((entry) => (
                  <View
                    key={entry.id}
                    style={[styles.ledgerRow, { backgroundColor: colors.surface, borderColor: colors.line }]}
                  >
                    <View style={styles.ledgerLeft}>
                      <View style={[styles.ledgerIconCircle, { backgroundColor: `${colors.accent}20` }]}>
                        <Coins size={16} color={colors.accentStrong} />
                      </View>
                      <View style={styles.ledgerInfo}>
                        <Text style={[styles.ledgerDesc, { color: colors.ink }]}>{entry.description}</Text>
                        <Text style={[styles.ledgerDate, { color: colors.muted }]}>
                          {new Date(entry.createdAt).toLocaleDateString(undefined, {
                            month: 'short',
                            day: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </Text>
                      </View>
                    </View>
                    <Text style={[styles.ledgerPoints, { color: colors.accentStrong }]}>
                      +{entry.points} pts
                    </Text>
                  </View>
                ))}
              </View>
            )}
          </View>
        )}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingBottom: 40,
    gap: 16,
  },
  summaryCard: {
    padding: 18,
    borderRadius: 22,
    borderWidth: 1,
    gap: 14,
  },
  summaryTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  summaryLevelWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  levelIconPill: {
    width: 38,
    height: 38,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  levelTitleText: {
    fontSize: 16,
    fontWeight: '700',
  },
  levelSubText: {
    fontSize: 12,
    marginTop: 2,
  },
  pointsWrap: {
    alignItems: 'flex-end',
  },
  pointsValText: {
    fontSize: 22,
    fontWeight: '800',
  },
  pointsLabelText: {
    fontSize: 11,
    fontWeight: '500',
  },
  summaryProgressSection: {
    marginTop: 4,
  },
  summaryStatsRow: {
    flexDirection: 'row',
    borderTopWidth: 1,
    paddingTop: 12,
  },
  statCol: {
    flex: 1,
    alignItems: 'center',
  },
  statDivider: {
    width: 1,
    height: '80%',
    alignSelf: 'center',
  },
  statNum: {
    fontSize: 18,
    fontWeight: '700',
  },
  statLabel: {
    fontSize: 11,
    marginTop: 2,
  },
  tabContent: {
    gap: 14,
  },
  filterRow: {
    flexDirection: 'row',
    gap: 8,
    flexWrap: 'wrap',
  },
  challengeList: {
    gap: 12,
  },
  challengeCard: {
    padding: 16,
    borderRadius: 20,
    borderWidth: 1,
    gap: 10,
  },
  challengeTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  challengeBadgeRow: {
    flexDirection: 'row',
    gap: 6,
  },
  rewardPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  rewardPointsText: {
    fontSize: 13,
    fontWeight: '700',
  },
  challengeTitle: {
    fontSize: 16,
    fontWeight: '700',
  },
  challengeDescription: {
    fontSize: 13,
    lineHeight: 18,
  },
  periodRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  periodText: {
    fontSize: 12,
  },
  progressContainer: {
    gap: 6,
    marginTop: 4,
  },
  progressTextRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  progressValText: {
    fontSize: 12,
    fontWeight: '600',
  },
  progressPctText: {
    fontSize: 12,
  },
  cardActionRow: {
    marginTop: 6,
  },
  statusSuccessRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 6,
  },
  claimedText: {
    fontSize: 13,
    fontWeight: '600',
  },
  inProgressNotice: {
    fontSize: 11.5,
    fontStyle: 'italic',
    paddingTop: 4,
  },
  badgesGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  badgeCard: {
    width: '48.5%',
    padding: 14,
    borderRadius: 18,
    borderWidth: 1,
    gap: 6,
  },
  badgeIconWrap: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  badgeIconBubble: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeName: {
    fontSize: 14,
    fontWeight: '700',
  },
  badgeDesc: {
    fontSize: 11.5,
    lineHeight: 16,
  },
  badgeFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 4,
  },
  badgePoints: {
    fontSize: 12,
    fontWeight: '700',
  },
  badgeEarnedDate: {
    fontSize: 10.5,
  },
  historyCard: {
    padding: 14,
    borderRadius: 18,
    borderWidth: 1,
    gap: 6,
  },
  historyCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  historyTitle: {
    fontSize: 15,
    fontWeight: '700',
  },
  historyMeta: {
    fontSize: 12,
  },
  historyProgressRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 4,
  },
  historyProgText: {
    fontSize: 12,
    fontWeight: '600',
  },
  historyRewardText: {
    fontSize: 12,
    fontWeight: '700',
  },
  ledgerList: {
    gap: 10,
  },
  ledgerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 14,
    borderRadius: 18,
    borderWidth: 1,
  },
  ledgerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  ledgerIconCircle: {
    width: 34,
    height: 34,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ledgerInfo: {
    flex: 1,
  },
  ledgerDesc: {
    fontSize: 13,
    fontWeight: '600',
  },
  ledgerDate: {
    fontSize: 11,
    marginTop: 2,
  },
  ledgerPoints: {
    fontSize: 14,
    fontWeight: '700',
  },
});
