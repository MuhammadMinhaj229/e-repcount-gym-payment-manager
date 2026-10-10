import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import AuthLayout from './AuthLayout';

export default function AcceptInvitation() {
  return (
    <AuthLayout
      title="Accounts are managed by your Admin"
      icon="ShieldCheck"
      description="RepCount uses direct account creation rather than email invitations."
    >
      <div className="space-y-4">
        <p className="text-center text-sm leading-6 text-muted-foreground">
          Ask your gym administrator to create your account and assign your role. The administrator will share your initial password through a private channel.
        </p>
        <Button asChild className="w-full">
          <Link to="/login">Go to sign in</Link>
        </Button>
      </div>
    </AuthLayout>
  );
}
