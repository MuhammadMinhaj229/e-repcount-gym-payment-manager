import { Link } from 'react-router-dom';
import { useFetch } from '@/hooks/useFetch';
import { sdk } from '@/services/sdk';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import ApperIcon from '@/components/ApperIcon';
import { useProfile } from '@/hooks/useProfile';
import { getTableAccess } from '@/services/userPermissions';

export const route = {
  path: '/',
  layout: 'owner',
  access: "profile === 'Admin_c' || profile === 'Manager_c' || profile === 'Staff_c'",
};
export const nav = { label: 'Overview', icon: 'LayoutDashboard', order: 0 };

const { and, eq, gt, ne } = window.ApperSDK.CoreSDK;

const money = value => new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  maximumFractionDigits: 0,
}).format(Number(value || 0));

const dateKey = date => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

function aggregateNumber(result, id) {
  const aggregate = result.aggregators?.find(item => item.id === id);
  const value = aggregate?.data?.count ?? aggregate?.count ?? aggregate?.value ?? 0;
  return Number(value) || 0;
}

async function fetchAllTodayDues(today) {
  const records = [];
  let page = 1;
  let total = 0;
  while (true) {
    const result = await sdk.table('membership_dues_c')
      .select(['Id', 'Name', 'member_c', { field: 'member_c', ref: 'phone_c' }, 'due_date_c', 'balance_c', 'status_c'])
      .where(and(eq('due_date_c', today), gt('balance_c', 0), ne('status_c', 'Waived')))
      .orderBy('due_date_c')
      .page(page, 100)
      .fetch();
    if (!result.success) throw new Error(result.message || 'Could not load dues for today.');
    records.push(...result.data);
    total = result.total ?? records.length;
    if (!result.hasMore) return { rows: records, total };
    page += 1;
  }
}

function MetricCard({ to, label, value, detail, icon, tone = 'neutral', loading = false }) {
  const toneClass = tone === 'danger'
    ? 'bg-destructive/10 text-destructive'
    : tone === 'success'
      ? 'bg-success-muted text-success'
      : 'bg-secondary text-secondary-foreground';

  return (
    <Link
      to={to}
      className="group block min-h-36 rounded-xl border border-border bg-card p-5 shadow-xs transition hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      aria-label={`${label}. ${loading ? 'Loading' : value}. ${detail}. Open details`}
    >
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm font-medium text-muted-foreground">{label}</p>
        <span className={`rounded-lg p-2 ${toneClass}`}>
          <ApperIcon name={icon} size={19} />
        </span>
      </div>
      {loading
        ? <Skeleton className="mt-4 h-9 w-32" />
        : <p className="mt-3 font-heading text-3xl font-bold tracking-tight">{value}</p>}
      <div className="mt-3 flex items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">{detail}</p>
        <ApperIcon name="ArrowUpRight" size={16} className="shrink-0 text-muted-foreground transition group-hover:text-primary" />
      </div>
    </Link>
  );
}

export default function Home() {
  const { profile } = useProfile();
  const { canCreate: canCreateMember } = getTableAccess(profile, 'gym_members_c');
  const { canCreate: canCreatePayment } = getTableAccess(profile, 'payments_c');

  const now = new Date();
  const today = dateKey(now);
  const dateLabel = now.toLocaleDateString('en-IN', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });

  const {
    data: duesSummary,
    loading: duesSummaryLoading,
    error: duesSummaryError,
    run: reloadDuesSummary,
  } = useFetch(
    async () => {
      const filters = and(gt('balance_c', 0), ne('status_c', 'Waived'));
      const todayFilters = and(eq('due_date_c', today), gt('balance_c', 0), ne('status_c', 'Waived'));
      const result = await sdk.table('membership_dues_c')
        .select([{ field: 'Id' }])
        .aggregate([
          { id: 'outstanding', fields: [{ field: 'balance_c', fn: 'Sum', alias: 'count' }], where: filters },
          { id: 'dueTodayBalance', fields: [{ field: 'balance_c', fn: 'Sum', alias: 'count' }], where: todayFilters },
        ])
        .limit(1)
        .fetch();
      if (!result.success) throw new Error(result.message || 'Could not calculate outstanding dues.');
      return {
        outstanding: aggregateNumber(result, 'outstanding'),
        dueTodayBalance: aggregateNumber(result, 'dueTodayBalance'),
      };
    },
    [today],
  );

  const {
    data: dueTodayData,
    loading: dueTodayLoading,
    error: dueTodayError,
    run: reloadDueToday,
  } = useFetch(() => fetchAllTodayDues(today), [today]);

  const {
    data: paymentsSummary,
    loading: paymentsLoading,
    error: paymentsError,
    run: reloadPayments,
  } = useFetch(
    async () => {
      const result = await sdk.table('payments_c')
        .select([{ field: 'Id' }])
        .aggregate([
          {
            id: 'collectedToday',
            fields: [{ field: 'amount_c', fn: 'Sum', alias: 'count' }],
            where: and(eq('status_c', 'Paid'), eq('paid_on_c', today)),
          },
        ])
        .limit(1)
        .fetch();
      if (!result.success) throw new Error(result.message || 'Could not calculate today’s collections.');
      return { collectedToday: aggregateNumber(result, 'collectedToday') };
    },
    [today],
  );

  const todayRows = dueTodayData?.rows ?? [];
  const dueTodayMembers = Object.values(todayRows.reduce((groups, row) => {
    const memberId = row.member_c?.Id || `unlinked-${row.Id}`;
    if (!groups[memberId]) {
      groups[memberId] = {
        id: row.member_c?.Id,
        key: memberId,
        name: row.member_c?.Name || 'Member',
        phone: row.member_c?.phone_c || '',
        balance: 0,
        dueIds: [],
      };
    }
    groups[memberId].balance += Number(row.balance_c || 0);
    groups[memberId].dueIds.push(row.Id);
    return groups;
  }, {})).sort((a, b) => a.name.localeCompare(b.name));

  return (
    <div className="space-y-6 pb-4">
      <header className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-primary">Gym owner workspace</p>
          <h1 className="mt-2 font-heading text-2xl font-bold tracking-tight md:text-3xl">Collections overview</h1>
          <p className="mt-2 text-sm text-muted-foreground">{dateLabel}. Here is today's collection at a glance.</p>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:flex">
          {canCreateMember && (
            <Button asChild variant="outline" className="min-h-11">
              <Link to="/members/new"><ApperIcon name="UserPlus" size={16} className="mr-2" />Add member</Link>
            </Button>
          )}
          {canCreatePayment && (
            <Button asChild className="min-h-11">
              <Link to="/payments/new"><ApperIcon name="Plus" size={16} className="mr-2" />Record payment</Link>
            </Button>
          )}
        </div>
      </header>

      <section className="grid gap-3 md:grid-cols-3" aria-label="Today's collection summary">
        <MetricCard
          to="/dues?view=all"
          label="Outstanding fees"
          value={money(duesSummary?.outstanding)}
          detail="Review pending collections"
          icon="Wallet"
          loading={duesSummaryLoading}
        />
        <MetricCard
          to="/payments?period=today"
          label="Collected today"
          value={money(paymentsSummary?.collectedToday)}
          detail="View today's payments"
          icon="CircleCheck"
          tone="success"
          loading={paymentsLoading}
        />
        <MetricCard
          to="/dues?view=today"
          label="Members due today"
          value={dueTodayLoading ? '—' : dueTodayMembers.length}
          detail={`${money(duesSummary?.dueTodayBalance)} to collect today`}
          icon="CalendarCheck"
          tone="danger"
          loading={duesSummaryLoading || dueTodayLoading}
        />
      </section>

      {(duesSummaryError || paymentsError) && (
        <section role="alert" className="flex flex-col justify-between gap-3 rounded-lg border border-border p-4 sm:flex-row sm:items-center">
          <p className="text-sm text-muted-foreground">
            {duesSummaryError ? `Dues summary: ${duesSummaryError.message}` : `Payment summary: ${paymentsError.message}`}
          </p>
          <div className="flex gap-2">
            {duesSummaryError && <Button variant="outline" onClick={reloadDuesSummary}>Retry dues</Button>}
            {paymentsError && <Button variant="outline" onClick={reloadPayments}>Retry payments</Button>}
          </div>
        </section>
      )}

      <section className="overflow-hidden rounded-xl border border-border bg-card">
        <div className="flex flex-col justify-between gap-3 border-b border-border p-4 sm:flex-row sm:items-center md:p-5">
          <div>
            <h2 className="font-heading text-lg font-bold">Due today</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {dueTodayLoading ? 'Checking unpaid balances…' : `${dueTodayMembers.length} members with unpaid fees due today`}
            </p>
          </div>
          <Button asChild variant="outline" className="min-h-10">
            <Link to="/dues?view=today">View all due today <ApperIcon name="ArrowRight" size={15} className="ml-2" /></Link>
          </Button>
        </div>

        {dueTodayLoading ? (
          <div className="space-y-3 p-4" aria-label="Loading dues">
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
          </div>
        ) : dueTodayError ? (
          <div role="alert" className="p-5">
            <p className="text-sm font-medium">Today's dues could not be loaded.</p>
            <p className="mt-1 text-sm text-muted-foreground">{dueTodayError.message}</p>
            <Button variant="outline" className="mt-3" onClick={reloadDueToday}>Try again</Button>
          </div>
        ) : dueTodayMembers.length === 0 ? (
          <div className="px-5 py-10 text-center">
            <span className="mx-auto flex size-11 items-center justify-center rounded-full bg-success-muted text-success">
              <ApperIcon name="CheckCircle2" size={22} />
            </span>
            <h3 className="mt-3 font-semibold">All clear for today</h3>
            <p className="mt-1 text-sm text-muted-foreground">There are no unpaid membership fees due today.</p>
            <Button asChild variant="outline" className="mt-4">
              <Link to="/dues?view=all">Review all outstanding fees</Link>
            </Button>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {dueTodayMembers.slice(0, 5).map(member => (
              <article key={member.key} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
                <div className="flex min-w-0 flex-1 items-center gap-3">
                  <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-secondary text-sm font-semibold text-secondary-foreground">
                    {member.name.split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0]).join('').toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <p className="break-words text-sm font-semibold">{member.name}</p>
                    <p className="mt-1 text-xs text-muted-foreground">{member.phone || 'No phone number'}</p>
                  </div>
                </div>
                <div className="flex items-center justify-between gap-3 sm:justify-end">
                  <p className="font-heading text-base font-bold tabular-nums">{money(member.balance)}</p>
                  <Button asChild variant="outline" size="sm" className="min-h-10">
                    <Link to={member.id ? `/members/${member.id}` : `/dues/${member.dueIds[0]}`}>Review</Link>
                  </Button>
                </div>
              </article>
            ))}
            {dueTodayMembers.length > 5 && (
              <div className="border-t border-border bg-muted/20 px-4 py-3 text-center">
                <Button asChild variant="link" className="min-h-10">
                  <Link to="/dues?view=today">View all {dueTodayMembers.length} members due today</Link>
                </Button>
              </div>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
