import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { Crown, KeyRound, Mail, Trash2 } from 'lucide-react-native';
import { useNavigation } from '@/app/navigation/NavigationContext';
import { Screen } from '@/shared/components/ui/Screen';
import { ListGroup, ListRow } from '@/shared/components/ui/ListRow';
import { Badge } from '@/shared/components/ui/Badge';
import { Button } from '@/shared/components/ui/Button';
import { ConfirmDialog } from '@/shared/components/ui/ConfirmDialog';
import { showToast } from '@/shared/stores/toastStore';
import { useTheme } from '@/hooks/use-theme';
import { useAuthStore } from '@/features/auth/stores/auth-store';
import { AuthService } from '@/features/auth/services/auth-service';

export function AccountScreen() {
  const { colors } = useTheme();
  const { navigate, reset } = useNavigation();
  const user = useAuthStore((s) => s.user);
  const [confirm, setConfirm] = useState<'logout' | 'delete' | null>(null);

  return (
    <Screen title="Account">
      <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
        <ListGroup>
          <ListRow
            icon={Mail}
            title="Email"
            subtitle={user?.email || 'No email attached'}
            chevron={false}
            trailing={user?.isEmailVerified ? <Badge tone="good">Verified</Badge> : undefined}
          />
          <ListRow
            icon={KeyRound}
            title="Change password"
            onPress={() => navigate('resetPassword')}
          />
          <ListRow
            title="Sign-in methods"
            value="Email, Apple"
            chevron={false}
          />
        </ListGroup>

        {/* Subscription section */}
        <View style={[styles.subCard, { borderColor: colors.line }]}>
          <View style={styles.subHeader}>
            <Crown size={17} color={colors.ink} />
            <Text style={[styles.subTitle, { color: colors.ink }]}>FitOnus Free</Text>
            <Badge>Premium · Future</Badge>
          </View>
          <Text style={[styles.subText, { color: colors.muted }]}>
            Premium AI plans aren’t available yet. Everything in this prototype is included.
          </Text>
        </View>

        <View style={styles.btnStack}>
          <Button fullWidth variant="outline" onPress={() => setConfirm('logout')}>
            Log out
          </Button>
          <Button
            fullWidth
            variant="danger"
            icon={Trash2}
            onPress={() => setConfirm('delete')}
          >
            Delete account
          </Button>
        </View>
      </ScrollView>

      {/* Logout dialog */}
      <ConfirmDialog
        open={confirm === 'logout'}
        title="Log out?"
        message="You’ll need to log in again on this device."
        confirmLabel="Log out"
        destructive
        onCancel={() => setConfirm(null)}
        onConfirm={async () => {
          setConfirm(null);
          await AuthService.logout();
          reset('welcome');
        }}
      />

      {/* Delete account dialog */}
      <ConfirmDialog
        open={confirm === 'delete'}
        title="Delete your account?"
        message="Account deletion requires account verification through customer support."
        confirmLabel="Request deletion"
        destructive
        onCancel={() => setConfirm(null)}
        onConfirm={() => {
          setConfirm(null);
          showToast({ message: 'Contact support@fitonus.com to process deletion.' });
        }}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 16,
    paddingBottom: 32,
    gap: 16,
  },
  subCard: {
    borderRadius: 24,
    borderWidth: 1,
    borderStyle: 'dashed',
    padding: 18,
    gap: 8,
  },
  subHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  subTitle: {
    fontSize: 15,
    fontWeight: '700',
  },
  subText: {
    fontSize: 13,
    lineHeight: 18,
  },
  btnStack: {
    gap: 10,
    marginTop: 4,
  },
});

