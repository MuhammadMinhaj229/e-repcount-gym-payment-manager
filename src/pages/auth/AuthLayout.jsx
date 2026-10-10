import ApperIcon from '@/components/ApperIcon';
import { APP_CONFIG } from '@/config/app.config';

export default function AuthLayout({ children, title, description }) {
  return (
    <main className="relative flex min-h-svh items-center justify-center overflow-hidden bg-background px-4 py-10">
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -left-24 -top-28 size-80 rounded-full bg-primary/10 blur-3xl" />
        <div className="absolute -bottom-28 -right-20 size-80 rounded-full bg-orange-500/10 blur-3xl" />
      </div>
      <div className="relative w-full max-w-md">
        <header className="mb-7 flex flex-col items-center text-center">
          <div className="mb-3 flex size-14 items-center justify-center rounded-2xl bg-slate-950 text-white shadow-lg shadow-slate-950/15">
            <ApperIcon name="Dumbbell" size={28} className="text-orange-400" />
          </div>
          <p className="text-xl font-bold tracking-tight">{APP_CONFIG.name}</p>
          <p className="mt-1 text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Gym Payment Manager</p>
        </header>
        <section className="rounded-2xl border border-border/80 bg-card/95 p-6 shadow-2xl shadow-black/5 backdrop-blur sm:p-8">
          <div className="mb-6 space-y-2">
            <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
            {description && <p className="text-sm leading-6 text-muted-foreground">{description}</p>}
          </div>
          {children}
        </section>
        <footer className="mt-6 text-center text-xs text-muted-foreground">Private workspace · Protected with Supabase Auth</footer>
      </div>
    </main>
  );
}
