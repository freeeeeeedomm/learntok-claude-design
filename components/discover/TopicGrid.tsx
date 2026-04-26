import { TopicTile } from './TopicTile';

type Topic = { id: string; title: string; icon: string | null };

export function TopicGrid({
  topics,
  shelfTopicIds,
  courseCounts,
}: {
  topics: Topic[];
  shelfTopicIds: Set<string>;
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
          inLibrary={shelfTopicIds.has(t.id)}
        />
      ))}
    </div>
  );
}
