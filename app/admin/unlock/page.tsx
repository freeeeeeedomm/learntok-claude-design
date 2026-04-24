import { UnlockForm } from './UnlockForm';

export const dynamic = 'force-dynamic';

export default function AdminUnlockPage() {
  return (
    <main className="app">
      <div className="pad pad-top col gap-16" style={{ paddingTop: 80, maxWidth: 360 }}>
        <div className="eyebrow">admin</div>
        <div className="display" style={{ fontSize: 28 }}>
          unlock
        </div>
        <div className="body" style={{ color: 'var(--ink-mute)', fontSize: 13 }}>
          enter the admin password to manage the video pool.
        </div>
        <UnlockForm />
      </div>
    </main>
  );
}
