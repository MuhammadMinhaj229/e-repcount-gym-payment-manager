import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useDispatch } from 'react-redux';
import { sdk } from '@/services/sdk';
import { setUser } from '@/store/userSlice';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import ApperIcon from '@/components/ApperIcon';
import AuthLayout from './AuthLayout';

export default function AuthPage({ mode = 'login' }) {
  const navigate = useNavigate();
  const dispatch = useDispatch();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(event) {
    event.preventDefault();
    setError('');
    setLoading(true);
    try {
      const result = await sdk.session.login({ email: email.trim().toLowerCase(), password });
      if (!result.ok) {
        setError(result.error?.message || 'Sign in failed.');
        return;
      }
      dispatch(setUser(result.value));
      navigate('/', { replace: true });
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Sign in failed.');
    } finally {
      setLoading(false);
    }
  }

  if (mode === 'signup') {
    return (
      <AuthLayout
        title="Account access is managed by your Admin"
        description="RepCount accounts are created by your gym administrator."
        icon="ShieldCheck"
      >
        <div className="space-y-4">
          <p className="rounded-lg border border-border bg-muted/40 p-4 text-sm leading-6 text-muted-foreground">
            Public self-sign-up is disabled. Ask your RepCount Admin to create your account, set your initial password and assign your role. No Gmail verification link is required for Admin-created accounts.
          </p>
          <Button asChild className="w-full">
            <Link to="/login">Back to sign in</Link>
          </Button>
        </div>
      </AuthLayout>
    );
  }

  if (sdk.session.initFailed) {
    return (
      <AuthLayout title="Supabase configuration required" description="RepCount needs its database configuration before you can sign in." icon="Database">
        <div className="space-y-4">
          <p className="rounded-lg border border-border bg-muted/40 p-4 text-sm leading-6 text-muted-foreground">
            Set VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY in Vercel's Production environment and redeploy. Do not add a service-role key to the frontend.
          </p>
          <Button variant="outline" className="w-full" onClick={() => window.location.reload()}>Retry after redeploy</Button>
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout title="Welcome back" description="Sign in to manage members, membership plans and collections." icon="Dumbbell">
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div className="space-y-2">
          <Label htmlFor="email">Email address</Label>
          <Input
            id="email"
            type="email"
            autoComplete="username"
            placeholder="you@gym.com"
            value={email}
            onChange={event => setEmail(event.target.value)}
            required
            autoFocus
          />
        </div>
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label htmlFor="password">Password</Label>
            <Link to="/forgot-password" className="text-xs font-medium text-primary hover:underline">Forgot password?</Link>
          </div>
          <div className="relative">
            <Input
              id="password"
              type={showPassword ? 'text' : 'password'}
              autoComplete="current-password"
              value={password}
              onChange={event => setPassword(event.target.value)}
              required
              className="pr-10"
            />
            <button
              type="button"
              onClick={() => setShowPassword(value => !value)}
              aria-label={showPassword ? 'Hide password' : 'Show password'}
              className="absolute inset-y-0 right-0 flex items-center px-3 text-muted-foreground hover:text-foreground"
            >
              <ApperIcon name={showPassword ? 'EyeOff' : 'Eye'} size={16} />
            </button>
          </div>
        </div>
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        <Button type="submit" disabled={loading} className="mt-1 w-full">
          {loading ? 'Signing in…' : 'Sign in'}
        </Button>
        <p className="text-center text-xs leading-5 text-muted-foreground">
          Need access? Ask your gym's administrator to create your account.
        </p>
      </form>
    </AuthLayout>
  );
}
