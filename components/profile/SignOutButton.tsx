'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

export function SignOutButton() {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  const onClick = async () => {
    if (pending) return;
    setPending(true);
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push('/login');
  };

  return (
    <button
      type="button"
      className="btn btn-secondary"
      onClick={onClick}
      disabled={pending}
      data-testid="profile-sign-out"
      style={{ width: '100%' }}
    >
      {pending ? 'signing out…' : 'Sign out'}
    </button>
  );
}
