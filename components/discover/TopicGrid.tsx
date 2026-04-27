import { TopicTile } from './TopicTile';

type Topic = { id: string; title: string; icon: string | null };

export function TopicGrid({
  topics,
  importedByPresetId,
  courseCounts,
}: {
  topics: Topic[];
  /**
   * Map from preset-topic id → owner-owned topic id for the *current user*.
   * Presence flips the per-tile CTA from "+ add to home" to "open" and
   * targets the user's owned copy.
   */
  importedByPresetId: Map<string, string>;
  courseCounts: Map<string, number>;
}) {
  return (
    <div className="topic-grid" data-testid="topic-grid">
      {topics.map((t) => (
        <TopicTile
          key={t.id}
          id={t.id}
          title={t.title}
          icon={t.icon}
          courseCount={courseCounts.get(t.id) ?? 0}
          ownerTopicId={importedByPresetId.get(t.id) ?? null}
        />
      ))}
    </div>
  );
}
