import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Modal,
  TouchableWithoutFeedback,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Crown, KeyRound, Mail, Trash2, User as UserIcon, ShieldCheck } from 'lucide-react-native';
import { useNavigation } from '@/app/navigation/NavigationContext';
import { Screen } from '@/shared/components/ui/Screen';
import { ListGroup, ListRow } from '@/shared/components/ui/ListRow';
import { Badge } from '@/shared/components/ui/Badge';
import { Button } from '@/shared/components/ui/Button';
import { ConfirmDialog } from '@/shared/components/ui/ConfirmDialog';
import { PasswordField } from '@/features/auth/components/PasswordField';
import { StatusBanner } from '@/shared/components/ui/StatusBanner';
import { showToast } from '@/shared/stores/toastStore';
import { useTheme } from '@/hooks/use-theme';
import { useAuthStore } from '@/features/auth/stores/auth-store';
import { AuthService } from '@/features/auth/services/auth-service';

export function AccountScreen() {
  const { colors } = useTheme();
  const { navigate, reset } = useNavigation();
  const user = useAuthStore((s) => s.user);

  const [confirmLogout, setConfirmLogout] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deletePassword, setDeletePassword] = useState('');
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const handleDeleteAccount = async () => {
    if (!deletePassword) {
      setDeleteError('Please enter your password to confirm deletion.');
      return;
    }

    setIsDeleting(true);
    setDeleteError(null);

    try {
      await AuthService.deleteAccount(deletePassword);
      setShowDeleteModal(false);
      setDeletePassword('');
      showToast({ message: 'Your account has been deleted.' });
      reset('welcome');
    } catch (err: any) {
      setDeleteError(err.message || 'Incorrect password. Deletion failed.');
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <Screen title="Account" contentContainerStyle={styles.container}>
      <ListGroup>
          <ListRow
            icon={UserIcon}
            title="Name"
            value={user?.name || 'OnusFit Athlete'}
            chevron={false}
          />
          <ListRow
            icon={Mail}
            title="Email"
            subtitle={user?.email || 'No email attached'}
            chevron={false}
            trailing={user?.isEmailVerified ? <Badge tone="good">Verified</Badge> : <Badge tone="warn">Unverified</Badge>}
          />
          <ListRow
            icon={ShieldCheck}
            title="Account status"
            value="Active"
            trailing={<Badge tone="good">Active</Badge>}
            chevron={false}
          />
          <ListRow
            icon={KeyRound}
            title="Change password"
            onPress={() => navigate('changePassword')}
          />
        </ListGroup>

        {/* Subscription section */}
        <View style={[styles.subCard, { borderColor: colors.line }]}>
          <View style={styles.subHeader}>
            <Crown size={17} color={colors.ink} />
            <Text style={[styles.subTitle, { color: colors.ink }]}>OnusFit Free</Text>
            <Badge>Premium · Future</Badge>
          </View>
          <Text style={[styles.subText, { color: colors.muted }]}>
            Premium AI plans aren’t available yet. Everything in OnusFit today is included.
          </Text>
        </View>

        <View style={styles.btnStack}>
          <Button fullWidth variant="outline" onPress={() => setConfirmLogout(true)}>
            Log out
          </Button>
          <Button
            fullWidth
            variant="danger"
            icon={Trash2}
            onPress={() => {
              setDeletePassword('');
              setDeleteError(null);
              setShowDeleteModal(true);
            }}
          >
            Delete account
          </Button>
        </View>

      {/* Logout dialog */}
      <ConfirmDialog
        open={confirmLogout}
        title="Log out?"
        message="You’ll need to log in again on this device."
        confirmLabel="Log out"
        destructive
        onCancel={() => setConfirmLogout(false)}
        onConfirm={async () => {
          setConfirmLogout(false);
          await AuthService.logout();
          reset('welcome');
        }}
      />

      {/* Secure Delete Account Modal */}
      <Modal
        visible={showDeleteModal}
        transparent
        animationType="fade"
        onRequestClose={() => {
          if (!isDeleting) {
            setShowDeleteModal(false);
            setDeletePassword('');
            setDeleteError(null);
          }
        }}
      >
        <TouchableWithoutFeedback
          onPress={() => {
            if (!isDeleting) {
              setShowDeleteModal(false);
              setDeletePassword('');
              setDeleteError(null);
            }
          }}
        >
          <View style={styles.modalOverlay}>
            <TouchableWithoutFeedback>
              <KeyboardAvoidingView
                behavior={Platform.OS === 'ios' ? 'padding' : undefined}
                style={[
                  styles.modalContent,
                  {
                    backgroundColor: colors.surface,
                    borderColor: colors.line,
                  },
                ]}
              >
                <Text style={[styles.modalTitle, { color: colors.ink }]}>
                  Delete your account?
                </Text>

                <Text style={[styles.modalWarning, { color: colors.bad }]}>
                  This action is permanent and cannot be undone. All your workout logs, weight history, nutrition logs, personal records, and settings will be permanently erased.
                </Text>

                {deleteError ? (
                  <StatusBanner
                    tone="error"
                    title="Deletion failed"
                    body={deleteError}
                    style={styles.modalBanner}
                  />
                ) : null}

                <View style={styles.modalInputWrapper}>
                  <PasswordField
                    label="Confirm with your password"
                    value={deletePassword}
                    onChange={(val) => {
                      setDeletePassword(val);
                      if (deleteError) setDeleteError(null);
                    }}
                    placeholder="Enter your current password"
                  />
                </View>

                <View style={styles.modalButtons}>
                  <Button
                    variant="outline"
                    disabled={isDeleting}
                    onPress={() => {
                      setShowDeleteModal(false);
                      setDeletePassword('');
                      setDeleteError(null);
                    }}
                    style={styles.modalBtn}
                  >
                    Cancel
                  </Button>
                  <Button
                    variant="danger"
                    loading={isDeleting}
                    disabled={isDeleting || !deletePassword}
                    onPress={handleDeleteAccount}
                    style={styles.modalBtn}
                  >
                    Delete account
                  </Button>
                </View>
              </KeyboardAvoidingView>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingBottom: 24,
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
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  modalContent: {
    width: '100%',
    maxWidth: 400,
    borderRadius: 24,
    borderWidth: 1,
    padding: 24,
    gap: 12,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
  },
  modalWarning: {
    fontSize: 13,
    lineHeight: 18,
  },
  modalBanner: {
    marginBottom: 4,
  },
  modalInputWrapper: {
    marginVertical: 4,
  },
  modalButtons: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 8,
  },
  modalBtn: {
    flex: 1,
  },
});
