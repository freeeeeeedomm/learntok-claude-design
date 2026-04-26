import { redirect } from 'next/navigation';

// /progress was renamed to /profile in PR 2. This stub preserves any deep
// links / bookmarks pointing at the old URL.
export default function ProgressPage(): never {
  redirect('/profile');
}
