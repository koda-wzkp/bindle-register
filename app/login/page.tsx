import { LoginForm } from '@/components/LoginForm';
import { safeNextPath } from '@/lib/api';

export const dynamic = 'force-dynamic';

export default function LoginPage({
  searchParams,
}: {
  searchParams: { next?: string; error?: string };
}) {
  return (
    <div className="space-y-6">
      <h1 className="font-display text-2xl">Sign in</h1>
      <p className="max-w-md text-sm text-ink-soft">
        Enter the email address your theatre uses for you. We&rsquo;ll send a link that signs you
        in — no password, no account to create.
      </p>
      <LoginForm next={safeNextPath(searchParams.next, '/')} expired={searchParams.error === 'expired'} />
    </div>
  );
}
