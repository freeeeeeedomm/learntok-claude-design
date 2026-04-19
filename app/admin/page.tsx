import { requireAdmin } from '@/lib/admin-auth';

export const dynamic = 'force-dynamic';

// Stub: full implementation lives in Task 3 of the phase-5 plan.
// For now we just need the guard to run so /admin properly redirects
// non-admins to /admin/unlock, and stays at /admin for admins.
export default async function AdminPage() {
  await requireAdmin();
  return (
    <main className="app">
      <div className="pad pad-top col gap-16">
        <div className="eyebrow">admin</div>
        <div className="display" style={{ fontSize: 26 }}>
          video pool
        </div>
        <div className="body" style={{ color: 'var(--ink-mute)', fontSize: 13 }}>
          coming soon.
        </div>
      </div>
    </main>
  );
}
