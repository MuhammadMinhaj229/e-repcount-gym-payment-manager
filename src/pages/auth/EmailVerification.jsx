import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import AuthLayout from './AuthLayout';

export default function EmailVerification() {
  return (
    <AuthLayout
      title="No email verification required"
      icon="ShieldCheck"
      description="RepCount accounts created by an Admin are confirmed by the server."
    >
      <div className="space-y-4">
        <p className="text-center text-sm leading-6 text-muted-foreground">
          You do not need to enter a verification code. Ask your administrator for account access if you have not received your initial sign-in details.
        </p>
        <Button asChild className="w-full">
          <Link to="/login">Go to sign in</Link>
        </Button>
      </div>
    </AuthLayout>
  );
}
