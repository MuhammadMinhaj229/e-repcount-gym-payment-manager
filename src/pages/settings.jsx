import { useMemo, useState } from 'react';
import { useFetch } from '@/hooks/useFetch';
import { useAuth } from '@/layouts/RootLayout';
import { sdk } from '@/services/sdk';
import { PROFILES, getProfileMeta } from '@/services/userPermissions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { toast } from 'sonner';
import ApperIcon from '@/components/ApperIcon';

export const route = {
  path: '/settings',
  layout: 'owner',
  access: "profile === 'Admin_c'",
};

export const nav = {
  label: 'Settings',
  icon: 'Settings',
  order: 90,
  profiles: ['Admin_c'],
};

const roleOptions = Object.entries(PROFILES).map(([value, profile]) => ({
  value,
  label: profile.label,
}));

function getRoleLabel(profileName) {
  return PROFILES[profileName]?.label ?? String(profileName || 'Unassigned').replace(/_c$/, '');
}

function formatInviteDate(value) {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? '—'
    : date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

function getApiMessage(error) {
  return error?.message || 'The team service could not complete this action. Try again.';
}

function Stat({ icon, label, value, detail }) {
  return (
    <div className="relative overflow-hidden rounded-xl border border-border bg-card p-4">
      <ApperIcon
        name={icon}
        size={38}
        className="pointer-events-none absolute -right-1 -top-1 text-foreground/[0.06]"
      />
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="mt-2 font-heading text-2xl font-bold tabular-nums">{value}</p>
      <p className="mt-1 text-xs text-muted-foreground">{detail}</p>
    </div>
  );
}

function EmptyState({ icon, title, detail, action }) {
  return (
    <div className="flex flex-col items-center justify-center px-5 py-12 text-center">
      <div className="flex size-12 items-center justify-center rounded-xl bg-muted text-muted-foreground">
        <ApperIcon name={icon} size={23} />
      </div>
      <h3 className="mt-4 font-heading text-lg font-bold">{title}</h3>
      <p className="mt-1 max-w-md text-sm leading-6 text-muted-foreground">{detail}</p>
      {action}
    </div>
  );
}

export default function Settings() {
  const { user } = useAuth();
  const currentProfile = user?.profile ?? '';
  const canManageTeam = getProfileMeta(currentProfile).canManageTeam;
  const [activeTab, setActiveTab] = useState('members');
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState('Staff_c');
  const [busyKey, setBusyKey] = useState('');
  const [confirmation, setConfirmation] = useState(null);

  const {
    data: memberResult,
    loading: membersLoading,
    error: membersError,
    run: reloadMembers,
  } = useFetch(
    async () => {
      const result = await sdk.teams.getMembers(0, 100);
      return {
        rows: result?.data ?? [],
        total: result?.total ?? result?.data?.length ?? 0,
        hasMore: Boolean(result?.hasMore),
      };
    },
    [],
  );

  const {
    data: invitationResult,
    loading: invitationsLoading,
    error: invitationsError,
    run: reloadInvitations,
  } = useFetch(
    async () => {
      const result = await sdk.teams.getInvitedMembers(0, 100);
      return {
        rows: result?.data ?? [],
        total: result?.total ?? result?.data?.length ?? 0,
        hasMore: Boolean(result?.hasMore),
      };
    },
    [],
  );

  const members = memberResult?.rows ?? [];
  const invitations = invitationResult?.rows ?? [];
  const currentUserId = user?.userId ?? user?.id;
  const adminCount = useMemo(
    () => members.filter(member => member.profile?.name === 'Admin_c').length,
    [members],
  );

  async function inviteUser(event) {
    event.preventDefault();
    const email = inviteEmail.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      toast.error('Enter a valid email address.');
      return;
    }
    if (!Object.hasOwn(PROFILES, inviteRole)) {
      toast.error('Select a valid role.');
      return;
    }

    setBusyKey('invite');
    try {
      await sdk.teams.inviteUsers({
        invitations: [{ email, profileName: inviteRole }],
      });
      toast.success('Invitation requested', {
        description: 'The invitation and role are managed by your configured authentication provider.',
      });
      setInviteEmail('');
      setInviteOpen(false);
      setActiveTab('invitations');
      await Promise.all([reloadInvitations(), reloadMembers()]);
    } catch (error) {
      toast.error(getApiMessage(error));
    } finally {
      setBusyKey('');
    }
  }

  async function changeRole(member, nextProfile) {
    const memberId = String(member.id);
    if (memberId === String(currentUserId)) {
      toast.error('You cannot change your own role from this screen.');
      return;
    }
    if (!Object.hasOwn(PROFILES, nextProfile)) {
      toast.error('Select a valid role.');
      return;
    }
    if (member.profile?.name === nextProfile) return;
    if (member.profile?.name === 'Admin_c' && nextProfile !== 'Admin_c' && adminCount <= 1) {
      toast.error('Keep at least one administrator on the workspace.');
      return;
    }

    setBusyKey('role-' + memberId);
    try {
      await sdk.teams.updateMemberProfile(member.id, { profile: nextProfile });
      toast.success('Role updated', {
        description: member.name + ' is now ' + getRoleLabel(nextProfile) + '.',
      });
      await reloadMembers();
    } catch (error) {
      toast.error(getApiMessage(error));
      await reloadMembers();
    } finally {
      setBusyKey('');
    }
  }

  async function confirmRemoval() {
    if (!confirmation) return;
    const { type, row } = confirmation;
    const key = type + '-' + (type === 'member' ? row.id : row.invitationId);
    setBusyKey(key);
    try {
      if (type === 'member') {
        const isSelf = String(row.id) === String(currentUserId);
        if (isSelf) throw new Error('You cannot remove your own account here.');
        if (row.profile?.name === 'Admin_c' && adminCount <= 1) {
          throw new Error('Keep at least one administrator on the workspace.');
        }
        await sdk.teams.deleteMember(row.id);
        toast.success('Team member removed', { description: row.name + ' no longer has workspace access.' });
        await reloadMembers();
      } else {
        await sdk.teams.deleteInvitation(row.invitationId);
        toast.success('Invitation cancelled', { description: row.invitedEmail });
        await reloadInvitations();
      }
      setConfirmation(null);
    } catch (error) {
      toast.error(getApiMessage(error));
    } finally {
      setBusyKey('');
    }
  }

  async function resendInvitation(row) {
    setBusyKey('resend-' + row.invitationId);
    try {
      await sdk.teams.resendInvitation(row.invitationId);
      toast.success('Invitation resent', { description: row.invitedEmail });
      await reloadInvitations();
    } catch (error) {
      toast.error(getApiMessage(error));
    } finally {
      setBusyKey('');
    }
  }

  if (!canManageTeam) {
    return (
      <div className="mx-auto max-w-3xl rounded-xl border border-border bg-card p-8 text-center">
        <ApperIcon name="ShieldAlert" size={32} className="mx-auto text-muted-foreground" />
        <h1 className="mt-4 font-heading text-2xl font-bold">Administrator access required</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Only an administrator can manage team members, invitations and roles.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-4">
      <header className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-primary">Workspace administration</p>
          <h1 className="mt-2 font-heading text-3xl font-bold tracking-tight">Settings and users</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
            Manage who can access RepCount, invite new users, assign Admin, Manager or Staff roles, and remove access when it is no longer needed.
          </p>
        </div>
        <Button onClick={() => setInviteOpen(value => !value)} className="min-h-11">
          <ApperIcon name={inviteOpen ? 'X' : 'UserPlus'} size={16} className="mr-2" />
          {inviteOpen ? 'Close invitation' : 'Invite a user'}
        </Button>
      </header>

      <div className="flex items-start gap-3 rounded-xl border border-warning-border bg-warning-muted p-4">
        <ApperIcon name="Info" size={19} className="mt-0.5 shrink-0 text-warning-foreground" />
        <div>
          <p className="text-sm font-semibold text-warning-foreground">Demo authentication is still active</p>
          <p className="mt-1 text-sm leading-5 text-warning-foreground/90">
            This build uses the in-memory adapter. Team actions are for the showcase and are not a source of persistent accounts or secure, server-enforced roles until the live backend is connected.
          </p>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Stat icon="Users" label="Active users" value={membersLoading ? '—' : memberResult?.total ?? members.length} detail="People with workspace access" />
        <Stat icon="MailCheck" label="Pending invitations" value={invitationsLoading ? '—' : invitationResult?.total ?? invitations.length} detail="Waiting to join" />
        <Stat icon="ShieldCheck" label="Access roles" value={roleOptions.length} detail="Admin, Manager and Staff" />
      </div>

      <section className="overflow-hidden rounded-xl border border-border bg-card">
        {inviteOpen && (
          <form onSubmit={inviteUser} className="space-y-4 border-b border-border bg-muted/30 p-4 md:p-6">
            <div className="flex items-start gap-3">
              <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <ApperIcon name="MailPlus" size={19} />
              </div>
              <div>
                <h2 className="font-heading text-lg font-bold">Invite a teammate</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  They'll receive an invitation through the configured authentication provider and join with the role you choose.
                </p>
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_200px]">
              <div className="space-y-2">
                <Label htmlFor="invite-email">Work email *</Label>
                <Input
                  id="invite-email"
                  type="email"
                  autoComplete="email"
                  placeholder="person@gym.com"
                  value={inviteEmail}
                  onChange={event => setInviteEmail(event.target.value)}
                  required
                  disabled={busyKey === 'invite'}
                  className="min-h-11 bg-background"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="invite-role">Role *</Label>
                <select
                  id="invite-role"
                  value={inviteRole}
                  onChange={event => setInviteRole(event.target.value)}
                  disabled={busyKey === 'invite'}
                  className="h-11 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {roleOptions.map(role => (
                    <option key={role.value} value={role.value}>{role.label}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
              <p className="text-xs leading-5 text-muted-foreground">
                Admin can manage users. Manager can manage gym operations. Staff is intended for day-to-day payment work.
              </p>
              <Button disabled={busyKey === 'invite'} className="min-h-11 shrink-0">
                <ApperIcon name={busyKey === 'invite' ? 'LoaderCircle' : 'Send'} size={16} className={'mr-2 ' + (busyKey === 'invite' ? 'animate-spin' : '')} />
                {busyKey === 'invite' ? 'Sending invitation…' : 'Send invitation'}
              </Button>
            </div>
          </form>
        )}

        <Tabs value={activeTab} onValueChange={setActiveTab} className="gap-0">
          <div className="flex flex-col justify-between gap-3 border-b border-border px-4 py-3 sm:flex-row sm:items-center md:px-6">
            <TabsList>
              <TabsTrigger value="members">Active users</TabsTrigger>
              <TabsTrigger value="invitations">Pending invitations</TabsTrigger>
            </TabsList>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => activeTab === 'members' ? reloadMembers() : reloadInvitations()}
              disabled={membersLoading || invitationsLoading}
            >
              <ApperIcon name="RefreshCw" size={14} className="mr-2" />Refresh
            </Button>
          </div>

          <TabsContent value="members" className="m-0">
            {membersError ? (
              <EmptyState
                icon="WifiOff"
                title="Couldn't load team members"
                detail={membersError + ' You need an available team service and permission to manage the workspace.'}
                action={<Button variant="outline" onClick={reloadMembers} className="mt-4">Try again</Button>}
              />
            ) : membersLoading && !memberResult ? (
              <div className="space-y-3 p-5" aria-label="Loading team members">
                <div className="h-12 animate-pulse rounded-md bg-foreground/5" />
                <div className="h-12 animate-pulse rounded-md bg-foreground/5" />
                <div className="h-12 animate-pulse rounded-md bg-foreground/5" />
              </div>
            ) : members.length === 0 ? (
              <EmptyState
                icon="Users"
                title="No team members found"
                detail="Invite your first teammate to start assigning workspace roles."
                action={<Button className="mt-4" onClick={() => setInviteOpen(true)}>Invite a user</Button>}
              />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[720px] text-left text-sm">
                  <thead className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
                    <tr>
                      <th scope="col" className="px-5 py-3 font-semibold">User</th>
                      <th scope="col" className="px-5 py-3 font-semibold">Current role</th>
                      <th scope="col" className="px-5 py-3 font-semibold">Change role</th>
                      <th scope="col" className="px-5 py-3 text-right font-semibold">Access</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {members.map(member => {
                      const memberProfile = member.profile?.name ?? '';
                      const isSelf = String(member.id) === String(currentUserId);
                      const protectsLastAdmin = memberProfile === 'Admin_c' && adminCount <= 1;
                      const actionDisabled = isSelf || busyKey === 'role-' + member.id;
                      return (
                        <tr key={member.id} className="align-middle transition-colors hover:bg-muted/20">
                          <td className="px-5 py-4">
                            <div className="flex items-center gap-3">
                              <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-secondary text-sm font-bold text-secondary-foreground">
                                {(member.name || member.email || 'U').split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0]).join('').toUpperCase()}
                              </div>
                              <div className="min-w-0">
                                <p className="font-semibold">{member.name || 'Unnamed user'} {isSelf && <span className="ml-1 text-xs font-medium text-primary">(You)</span>}</p>
                                <p className="mt-0.5 break-all text-xs text-muted-foreground">{member.email || 'No email supplied'}</p>
                              </div>
                            </div>
                          </td>
                          <td className="px-5 py-4">
                            <span className="inline-flex items-center gap-2 rounded-full border border-border px-2.5 py-1 text-xs font-semibold">
                              <span className={'size-1.5 rounded-full ' + (memberProfile === 'Admin_c' ? 'bg-primary' : memberProfile === 'Manager_c' ? 'bg-highlight' : 'bg-muted-foreground')} />
                              {getRoleLabel(memberProfile)}
                            </span>
                          </td>
                          <td className="px-5 py-4">
                            <label className="sr-only" htmlFor={'role-' + member.id}>Change role for {member.name || member.email}</label>
                            <select
                              id={'role-' + member.id}
                              value={memberProfile}
                              onChange={event => changeRole(member, event.target.value)}
                              disabled={actionDisabled || (protectsLastAdmin && memberProfile === 'Admin_c')}
                              className="h-10 min-w-36 rounded-md border border-input bg-background px-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60"
                            >
                              {roleOptions.map(role => <option key={role.value} value={role.value}>{role.label}</option>)}
                            </select>
                            {isSelf && <p className="mt-1 text-xs text-muted-foreground">Your own role is locked.</p>}
                          </td>
                          <td className="px-5 py-4 text-right">
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              onClick={() => setConfirmation({ type: 'member', row: member })}
                              disabled={isSelf || protectsLastAdmin || Boolean(busyKey)}
                              aria-label={'Remove ' + (member.name || member.email)}
                            >
                              <ApperIcon name="UserRoundX" size={15} className="mr-2" />Remove
                            </Button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                {memberResult?.hasMore && (
                  <p className="border-t border-border px-5 py-3 text-xs text-muted-foreground">
                    Showing the first 100 users. Additional users exist in the team.
                  </p>
                )}
              </div>
            )}
          </TabsContent>

          <TabsContent value="invitations" className="m-0">
            {invitationsError ? (
              <EmptyState
                icon="MailWarning"
                title="Couldn't load invitations"
                detail={invitationsError + ' Try refreshing when the team service is available.'}
                action={<Button variant="outline" onClick={reloadInvitations} className="mt-4">Try again</Button>}
              />
            ) : invitationsLoading && !invitationResult ? (
              <div className="space-y-3 p-5" aria-label="Loading pending invitations">
                <div className="h-12 animate-pulse rounded-md bg-foreground/5" />
                <div className="h-12 animate-pulse rounded-md bg-foreground/5" />
              </div>
            ) : invitations.length === 0 ? (
              <EmptyState
                icon="MailCheck"
                title="No pending invitations"
                detail="Invitations that are awaiting acceptance will appear here."
                action={<Button variant="outline" className="mt-4" onClick={() => setInviteOpen(true)}>Invite a user</Button>}
              />
            ) : (
              <div className="divide-y divide-border">
                {invitations.map(invitation => {
                  const key = 'invitation-' + invitation.invitationId;
                  return (
                    <div key={invitation.invitationId} className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between md:px-6">
                      <div className="flex min-w-0 items-start gap-3">
                        <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                          <ApperIcon name="Mail" size={18} />
                        </div>
                        <div className="min-w-0">
                          <p className="break-all font-semibold">{invitation.invitedEmail}</p>
                          <p className="mt-1 text-xs text-muted-foreground">
                            Invited {formatInviteDate(invitation.createdOn)}
                            {invitation.invitationCount > 1 ? ' · Sent ' + invitation.invitationCount + ' times' : ''}
                          </p>
                        </div>
                      </div>
                      <div className="flex shrink-0 gap-2">
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => resendInvitation(invitation)}
                          disabled={Boolean(busyKey)}
                        >
                          <ApperIcon name={busyKey === 'resend-' + invitation.invitationId ? 'LoaderCircle' : 'RefreshCw'} size={14} className={'mr-2 ' + (busyKey === 'resend-' + invitation.invitationId ? 'animate-spin' : '')} />
                          Resend
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => setConfirmation({ type: 'invitation', row: invitation })}
                          disabled={Boolean(busyKey)}
                        >
                          <ApperIcon name="X" size={14} className="mr-2" />Cancel
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </section>

      <section className="grid gap-3 md:grid-cols-2">
        <div className="rounded-xl border border-border bg-card p-5">
          <div className="flex items-center gap-3">
            <ApperIcon name="ShieldCheck" size={21} className="text-primary" />
            <h2 className="font-heading text-lg font-bold">Role guide</h2>
          </div>
          <div className="mt-4 space-y-3">
            {[
              { key: 'Admin_c', description: 'Manage the workspace, users, invitations and all gym records.' },
              { key: 'Manager_c', description: 'Manage membership plans, members, fee cycles and payment records.' },
              { key: 'Staff_c', description: 'Read gym records and record payments; no user administration.' },
            ].map(role => (
              <div key={role.key} className="flex items-start gap-3">
                <span className="mt-1.5 size-2 shrink-0 rounded-full bg-primary" />
                <div>
                  <p className="text-sm font-semibold">{PROFILES[role.key].label}</p>
                  <p className="mt-0.5 text-sm leading-5 text-muted-foreground">{role.description}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className="rounded-xl border border-border bg-card p-5">
          <div className="flex items-center gap-3">
            <ApperIcon name="LockKeyhole" size={21} className="text-primary" />
            <h2 className="font-heading text-lg font-bold">Access safeguards</h2>
          </div>
          <ul className="mt-4 space-y-3 text-sm leading-5 text-muted-foreground">
            <li className="flex gap-2"><ApperIcon name="Check" size={16} className="mt-0.5 shrink-0 text-success" />Only Admins can open this page.</li>
            <li className="flex gap-2"><ApperIcon name="Check" size={16} className="mt-0.5 shrink-0 text-success" />Your own access cannot be changed or removed here.</li>
            <li className="flex gap-2"><ApperIcon name="Check" size={16} className="mt-0.5 shrink-0 text-success" />The last remaining Admin is protected from removal or demotion.</li>
            <li className="flex gap-2"><ApperIcon name="Info" size={16} className="mt-0.5 shrink-0 text-warning" />Live role enforcement requires the configured backend and policies, not just this screen.</li>
          </ul>
        </div>
      </section>

      <AlertDialog open={Boolean(confirmation)} onOpenChange={open => !open && !busyKey && setConfirmation(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirmation?.type === 'member' ? 'Remove this user?' : 'Cancel this invitation?'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirmation?.type === 'member'
                ? 'This will revoke workspace access for ' + (confirmation.row?.name || confirmation.row?.email || 'this user') + '.'
                : 'The invitation for ' + (confirmation?.row?.invitedEmail || 'this email address') + ' will be cancelled.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={Boolean(busyKey)} onClick={() => setConfirmation(null)}>Keep access</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={Boolean(busyKey)}
              onClick={event => {
                event.preventDefault();
                confirmRemoval();
              }}
            >
              {busyKey ? 'Working…' : confirmation?.type === 'member' ? 'Remove user' : 'Cancel invitation'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
