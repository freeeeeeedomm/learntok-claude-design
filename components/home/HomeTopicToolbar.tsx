// components/home/HomeTopicToolbar.tsx
'use client';
import { useState } from 'react';
import { CreateTopicModal } from '@/components/library/CreateTopicModal';

type Props = { onOrganizeToggle: () => void; organizing: boolean };

export function HomeTopicToolbar({ onOrganizeToggle, organizing }: Props) {
  const [createOpen, setCreateOpen] = useState(false);
  return (
    <div className="row between aic mt-24">
      <div className="eyebrow">your topics</div>
      <div className="row gap-8">
        <button
          type="button"
          className="link-btn"
          onClick={() => setCreateOpen(true)}
          data-testid="home-create-topic"
        >
          + Create new
        </button>
        <button
          type="button"
          className="link-btn"
          onClick={onOrganizeToggle}
          data-testid="home-organize"
        >
          {organizing ? 'Done' : 'Organize'}
        </button>
      </div>
      <CreateTopicModal open={createOpen} onClose={() => setCreateOpen(false)} />
    </div>
  );
}
