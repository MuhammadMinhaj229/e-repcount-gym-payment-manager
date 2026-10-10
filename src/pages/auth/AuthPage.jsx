import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useDispatch } from 'react-redux';
import { sdk } from '@/services/sdk';
import { setUser } from '@/store/userSlice';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import ApperIcon from '@/components/ApperIcon';
import AuthLayout from './AuthLayout';

export default function AuthPage() {
  const navigate = useNavigate();
  const dispatch = useDispatch();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(event) {
    event.preventDefault();
    if (loading) return;
    setError('');
    setLoading(true);
    try {
      const result = await sdk.session.login({ email: email.trim().toLowerCase(), password });
      if (!result.ok) {
        setError(result.error?.message || 'Sign-in failed. Check your credentials and try again.');
        return;
      }
      dispatch(setUser(result.value));
      navigate('/', { replace: true });
    } catch {
      setError('We could not sign you in right now. Check your connection and try again.');
    } finally {
      setLoading(false);
    }
  }

  if (sdk.session.initFailed) {
    return (
      <AuthLayout title="Sign-in is temporarily unavailable" description="RepCount could not initialize its secure connection.">
        <div className="rounded-xl border border-border bg-muted/40 p-4 text-sm leading-6 text-muted-foreground" role="alert">
          {sdk.session.configurationError || 'Set VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY in Vercel, then redeploy. Never add a service-role key to the frontend.'}
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout title="Sign in to RepCount" description="Secure access to your gym workspace.">
      <form onSubmit={handleSubmit} className="flex flex-col gap-5" aria-label="RepCount sign-in form">
        <div className="space-y-2">
          <Label htmlFor="email">Email address</Label>
          <Input id="email" name="email" type="email" inputMode="email" autoComplete="username"
            placeholder="you@gym.com" value={email} onChange={(event) => setEmail(event.target.value)}
            required maxLength={254} disabled={loading} autoFocus />
        </div>
        <div className="space-y-2">
          <Label htmlFor="password">Password</Label>
          <div className="relative">
            <Input id="password" name="password" type={showPassword ? 'text' : 'password'}
              autoComplete="current-password" value={password}
              onChange={(event) => setPassword(event.target.value)} required maxLength={1024}
              disabled={loading} className="pr-11" />
            <button type="button" onClick={() => setShowPassword((visible) => !visible)}
              aria-label={showPassword ? 'Hide password' : 'Show password'} aria-pressed={showPassword}
              disabled={loading}
              className="absolute inset-y-0 right-0 flex items-center px-3 text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50">
              <ApperIcon name={showPassword ? 'EyeOff' : 'Eye'} size={16} />
            </button>
          </div>
        </div>
        {error && <p role="alert" aria-live="polite"
          className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2.5 text-sm text-destructive">{error}</p>}
        <Button type="submit" disabled={loading || !email.trim() || !password} className="mt-1 w-full">
          {loading ? 'Verifying securely…' : 'Sign in'}
        </Button>
        <p className="text-center text-xs leading-5 text-muted-foreground">
          Access is managed by your RepCount administrator. Three failed attempts lock this browser for 24 hours.
        </p>
      </form>
    </AuthLayout>
  );
}
