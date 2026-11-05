import React, { useState } from 'react';
import { CrownIcon, KeyRoundIcon, MailIcon, Trash2Icon } from 'lucide-react';
import { useNavigation } from '../../../app/navigation/NavigationContext';
import { Screen } from '../../../shared/components/ui/Screen';
import { ListGroup, ListRow } from '../../../shared/components/ui/ListRow';
import { Badge } from '../../../shared/components/ui/Badge';
import { Button } from '../../../shared/components/ui/Button';
import { ConfirmDialog } from '../../../shared/components/ui/ConfirmDialog';
import { showToast } from '../../../shared/stores/toastStore';

export function AccountScreen() {
  const { navigate, reset } = useNavigation();
  const [confirm, setConfirm] = useState<'logout' | 'delete' | null>(null);

  return (
    <Screen title="Account">
      <div className="space-y-4 px-4">
        <ListGroup>
          <ListRow icon={MailIcon} title="Email" subtitle="aarav.mehta@gmail.com" chevron={false} trailing={<Badge tone="good">Verified</Badge>} />
          <ListRow icon={KeyRoundIcon} title="Change password" onClick={() => navigate('resetPassword')} />
          <ListRow title="Sign-in methods" value="Email, Apple" chevron={false} />
        </ListGroup>

        <section className="rounded-3xl border border-dashed border-line p-5" aria-label="Subscription">
          <div className="flex items-center gap-2">
            <CrownIcon size={17} className="text-ink" aria-hidden="true" />
            <p className="text-[15px] font-semibold text-ink">FitOnus Free</p>
            <Badge>Premium · Future</Badge>
          </div>
          <p className="mt-1.5 text-[13px] text-muted">Premium AI plans aren’t available yet. Everything in this prototype is included.</p>
        </section>

        <Button fullWidth variant="outline" onClick={() => setConfirm('logout')}>Log out</Button>
        <Button fullWidth variant="danger" icon={Trash2Icon} onClick={() => setConfirm('delete')}>Delete account</Button>
      </div>

      <ConfirmDialog open={confirm === 'logout'} title="Log out?" message="You’ll need to log in again on this device." confirmLabel="Log out" destructive onCancel={() => setConfirm(null)} onConfirm={() => {setConfirm(null);reset('welcome');}} />
      <ConfirmDialog
        open={confirm === 'delete'}
        title="Delete your account?"
        message="All logs, AI memory and reports will be permanently deleted after 30 days. Data in Apple Health or Health Connect isn’t affected."
        confirmLabel="Delete account"
        destructive
        onCancel={() => setConfirm(null)}
        onConfirm={() => {setConfirm(null);showToast({ message: 'Account scheduled for deletion' });reset('welcome');}} />
      
    </Screen>);

}