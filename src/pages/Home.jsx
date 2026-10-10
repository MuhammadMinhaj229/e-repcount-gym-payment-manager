import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useFetch } from '@/hooks/useFetch';
import { sdk } from '@/services/sdk';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import ApperIcon from '@/components/ApperIcon';
import { useProfile } from '@/hooks/useProfile';
import { getTableAccess } from '@/services/userPermissions';

export const route = { path: '/', layout: 'owner', access: "profile === 'Admin_c' || profile === 'Manager_c' || profile === 'Staff_c'" };
export const nav = { label: 'Overview', icon: 'LayoutDashboard', order: 0 };

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

const startOfWeek = date => {
  const value = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const offset = (value.getDay() + 6) % 7;
  value.setDate(value.getDate() - offset);
  return value;
};

const endOfWeek = date => {
  const value = startOfWeek(date);
  value.setDate(value.getDate() + 6);
  return value;
};

const formatDate = value => value ? new Date(`${value}T12:00:00`).toLocaleDateString('en-IN', {
  day: 'numeric',
  month: 'short',
}) : 'Not set';

function Metric({ label, value, detail, icon, onClick, tone = 'neutral' }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="min-h-36 w-full rounded-lg border border-border bg-card p-4 text-left shadow-xs transition hover:-translate-y-0.5 hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <div className="flex items-start justify-between gap-2">
        <span className="text-sm font-medium text-muted-foreground">{label}</span>
        <span className={`rounded-md p-2 ${tone === 'danger' ? 'bg-destructive/10 text-destructive' : tone === 'warning' ? 'bg-warning-muted text-warning-foreground' : tone === 'success' ? 'bg-success-muted text-success' : 'bg-secondary text-secondary-foreground'}`}>
          <ApperIcon name={icon} size={18} />
        </span>
      </div>
      <p className="mt-3 font-heading text-3xl font-bold tracking-tight">{value}</p>
      <p className="mt-1 text-xs text-muted-foreground">{detail}</p>
    </button>
  );
}

export default function Home() {
  const [activeBucket, setActiveBucket] = useState('today');
  const [search, setSearch] = useState('');
  const { profile } = useProfile();
  const { canCreate: canCreateMember } = getTableAccess(profile, 'gym_members_c');
  const { data: dues, loading: duesLoading, error: duesError, run: reloadDues } = useFetch(
    () => sdk.table('membership_dues_c')
      .select(['Id', 'Name', 'member_c', 'plan_c', 'due_date_c', 'amount_due_c', 'amount_paid_c', 'balance_c', 'status_c'])
      .fetch()
      .then(result => {
        if (!result.success) throw new Error(result.message);
        return result.data;
      }),
    [],
  );
  const { data: payments, loading: paymentsLoading } = useFetch(
    () => sdk.table('payments_c')
      .select(['Id', 'Name', 'member_c', 'amount_c', 'paid_on_c', 'status_c'])
      .fetch()
      .then(result => {
        if (!result.success) throw new Error(result.message);
        return result.data;
      }),
    [],
  );
  const todayDate = new Date();
  const today = dateKey(todayDate);
  const weekEnd = dateKey(endOfWeek(todayDate));
  const weekStart = dateKey(startOfWeek(todayDate));
  const feeRows = dues ?? [];
  const paymentRows = payments ?? [];
  const outstanding = feeRows.filter(row => Number(row.balance_c || 0) > 0 && row.status_c !== 'Waived');
  const todayRows = outstanding.filter(row => row.due_date_c === today);
  const thisWeekRows = outstanding.filter(row => row.due_date_c > today && row.due_date_c <= weekEnd);
  const overdueRows = outstanding.filter(row => row.due_date_c < today);
  const collectedToday = paymentRows
    .filter(row => row.status_c === 'Paid' && row.paid_on_c === today)
    .reduce((sum, row) => sum + Number(row.amount_c || 0), 0);
  const totalOutstanding = outstanding.reduce((sum, row) => sum + Number(row.balance_c || 0), 0);
  const bucketMap = { today: todayRows, week: thisWeekRows, overdue: overdueRows };
  const bucketRows = bucketMap[activeBucket] ?? todayRows;
  const visibleRows = useMemo(() => bucketRows
    .filter(row => !search || `${row.member_c?.Name || ''} ${row.member_c?.phone_c || ''} ${row.Name || ''}`.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => (a.due_date_c || '').localeCompare(b.due_date_c || '')), [bucketRows, search]);
  const collectedThisWeek = paymentRows
    .filter(row => row.status_c === 'Paid' && row.paid_on_c >= weekStart && row.paid_on_c <= today)
    .reduce((sum, row) => sum + Number(row.amount_c || 0), 0);

  const metrics = [
    { id: 'today', label: 'Due today', count: todayRows.length, balance: money(todayRows.reduce((sum, row) => sum + Number(row.balance_c || 0), 0)), icon: 'CalendarCheck', tone: 'danger', detail: 'Needs attention today' },
    { id: 'week', label: 'Due later this week', count: thisWeekRows.length, balance: money(thisWeekRows.reduce((sum, row) => sum + Number(row.balance_c || 0), 0)), icon: 'CalendarDays', tone: 'warning', detail: `Through ${formatDate(weekEnd)}` },
    { id: 'overdue', label: 'Overdue', count: overdueRows.length, balance: money(overdueRows.reduce((sum, row) => sum + Number(row.balance_c || 0), 0)), icon: 'AlertCircle', tone: 'danger', detail: 'Past the due date' },
  ];

  return (
    <div className="space-y-6 pb-3">
      <section className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.17em] text-primary">Gym owner workspace</p>
          <h1 className="mt-2 font-heading text-2xl font-bold tracking-tight md:text-3xl">Collections at a glance</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {todayDate.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' })}. Here is what needs your attention.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:flex">
          <Button asChild variant="outline" className="min-h-11">
            <Link to="/dues"><ApperIcon name="CalendarClock" size={16} className="mr-2" />View dues</Link>
          </Button>
          {canCreateMember && <Button asChild className="min-h-11">
            <Link to="/members/new"><ApperIcon name="UserPlus" size={16} className="mr-2" />Add member</Link>
          </Button>}
        </div>
      </section>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-lg bg-primary p-5 text-primary-foreground shadow-md sm:col-span-2">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-sm font-medium text-primary-foreground/80">Total outstanding fees</p>
              {duesLoading ? <Skeleton className="mt-4 h-10 w-40" /> : <p className="mt-2 font-heading text-4xl font-bold tracking-tight">{money(totalOutstanding)}</p>}
              <p className="mt-2 text-xs text-primary-foreground/80">Only unpaid balances across membership fee cycles</p>
            </div>
            <ApperIcon name="Wallet" size={25} />
          </div>
          <Link to="/dues" className="mt-5 inline-flex min-h-10 items-center gap-2 rounded-md bg-primary-foreground/10 px-3 text-sm font-semibold hover:bg-primary-foreground/20">
            Review pending collections <ApperIcon name="ArrowUpRight" size={16} />
          </Link>
        </div>
        <div className="rounded-lg border border-border bg-card p-5 shadow-xs">
          <div className="flex items-center justify-between gap-2"><p className="text-sm font-medium text-muted-foreground">Collected today</p><span className="rounded-md bg-success-muted p-2 text-success"><ApperIcon name="CircleCheck" size={18} /></span></div>
          {paymentsLoading ? <Skeleton className="mt-4 h-9 w-28" /> : <p className="mt-3 font-heading text-3xl font-bold">{money(collectedToday)}</p>}
          <p className="mt-2 text-xs text-muted-foreground">Recorded payments for today</p>
        </div>
        <div className="rounded-lg border border-border bg-card p-5 shadow-xs">
          <div className="flex items-center justify-between gap-2"><p className="text-sm font-medium text-muted-foreground">Collected this week</p><span className="rounded-md bg-secondary p-2 text-secondary-foreground"><ApperIcon name="TrendingUp" size={18} /></span></div>
          {paymentsLoading ? <Skeleton className="mt-4 h-9 w-28" /> : <p className="mt-3 font-heading text-3xl font-bold">{money(collectedThisWeek)}</p>}
          <p className="mt-2 text-xs text-muted-foreground">Monday to today</p>
        </div>
      </section>

      <section className="grid gap-3 sm:grid-cols-3">
        {metrics.map(metric => (
          <Metric
            key={metric.id}
            label={metric.label}
            value={duesLoading ? '—' : metric.count}
            detail={duesLoading ? 'Loading fee records' : `${metric.balance} outstanding · ${metric.detail}`}
            icon={metric.icon}
            tone={metric.tone}
            onClick={() => setActiveBucket(metric.id)}
          />
        ))}
      </section>

      <section className="overflow-hidden rounded-lg border border-border bg-card shadow-sm">
        <div className="border-b border-border p-4 md:p-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="font-heading text-lg font-bold">Collection follow-ups</h2>
              <p className="mt-1 text-sm text-muted-foreground">Select a due group to see the exact members to contact.</p>
            </div>
            <Button asChild variant="outline" className="min-h-11">
              <Link to="/payments/new"><ApperIcon name="Plus" size={16} className="mr-2" />Record payment</Link>
            </Button>
          </div>
          <div className="mt-4 grid grid-cols-3 gap-2" role="tablist" aria-label="Filter fees by due period">
            {[
              { id: 'today', label: 'Today', count: todayRows.length },
              { id: 'week', label: 'This week', count: thisWeekRows.length },
              { id: 'overdue', label: 'Overdue', count: overdueRows.length },
            ].map(tab => (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={activeBucket === tab.id}
                onClick={() => setActiveBucket(tab.id)}
                className={`min-h-12 rounded-md border px-2 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${activeBucket === tab.id ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-background text-muted-foreground hover:bg-accent hover:text-foreground'}`}
              >
                {tab.label} <span className="ml-1 opacity-80">({duesLoading ? '…' : tab.count})</span>
              </button>
            ))}
          </div>
          <div className="relative mt-3">
            <ApperIcon name="Search" size={17} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input value={search} onChange={event => setSearch(event.target.value)} placeholder="Search member or fee reference…" className="min-h-11 pl-9" aria-label="Search follow-up members" />
          </div>
        </div>

        {duesError ? (
          <div className="p-8 text-center">
            <ApperIcon name="CircleAlert" size={28} className="mx-auto text-destructive" />
            <p className="mt-3 font-semibold">Could not load membership dues</p>
            <p className="mt-1 text-sm text-muted-foreground">{duesError.message}</p>
            <Button className="mt-4" variant="outline" onClick={reloadDues}>Try again</Button>
          </div>
        ) : duesLoading ? (
          <div className="space-y-3 p-4"><Skeleton className="h-16 w-full" /><Skeleton className="h-16 w-full" /><Skeleton className="h-16 w-full" /></div>
        ) : visibleRows.length === 0 ? (
          <div className="p-8 text-center md:p-12">
            <ApperIcon name="CalendarCheck" size={30} className="mx-auto text-muted-foreground" />
            <h3 className="mt-3 font-semibold">No unpaid fees in this view</h3>
            <p className="mt-1 text-sm text-muted-foreground">Try another due period or check the dues page.</p>
            <Button asChild variant="outline" className="mt-4"><Link to="/dues">Open dues register</Link></Button>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {visibleRows.map(row => {
              const memberId = row.member_c?.Id;
              const memberName = row.member_c?.Name || 'Unnamed member';
              const phone = row.member_c?.phone_c || '';
              const message = `Hi ${memberName}, this is a friendly reminder from your gym. Your membership fee balance is ${money(row.balance_c)}, due on ${row.due_date_c}. Please let us know if you would like to renew. Thank you!`;
              const waUrl = `https://wa.me/${phone.replace(/\D/g, '')}?text=${encodeURIComponent(message)}`;
              return (
                <article key={row.Id} className="border-l-4 border-l-primary px-4 py-4 transition hover:bg-muted/40 md:px-5">
                  <div className="flex items-start gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-secondary font-bold text-secondary-foreground">{memberName.split(' ').map(part => part[0]).slice(0, 2).join('')}</div>
                    <div className="min-w-0 flex-1">
                      <Link to={memberId ? `/members/${memberId}` : '/members'} className="break-words font-semibold hover:text-primary">{memberName}</Link>
                      <p className="mt-1 text-xs text-muted-foreground">{row.plan_c?.Name || 'Membership'} · Due {formatDate(row.due_date_c)}</p>
                      <p className="mt-2 text-xs text-muted-foreground">Fee {row.Name} · Paid {money(row.amount_paid_c || 0)} of {money(row.amount_due_c || 0)}</p>
                      <p className="mt-1 text-sm font-semibold">Balance: {money(row.balance_c)}</p>
                    </div>
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-2 pl-[52px]">
                    <Button asChild variant="outline" className="min-h-10">
                      <Link to={memberId ? `/members/${memberId}` : '/members'}><ApperIcon name="UserRound" size={15} className="mr-2" />Member</Link>
                    </Button>
                    <Button asChild className="min-h-10" disabled={!phone}>
                      <a href={waUrl} target="_blank" rel="noreferrer"><ApperIcon name="MessageCircle" size={15} className="mr-2" />WhatsApp</a>
                    </Button>
                  </div>
                </article>
              );
            })}
          </div>
        )}
        <div className="flex items-center justify-between gap-3 border-t border-border px-4 py-3 text-xs text-muted-foreground">
          <span>Week: {formatDate(weekStart)} – {formatDate(weekEnd)}</span>
          <Link to="/dues" className="font-semibold text-primary hover:underline">Full dues register →</Link>
        </div>
      </section>
    </div>
  );
}
