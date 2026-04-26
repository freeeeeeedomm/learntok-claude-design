type LedgerEntry = { id: number; label: string; delta: number; createdAt: string };
type Props = { ledger: LedgerEntry[] };
export function RecentActivity(_props: Props) {
  return <div data-testid="profile-activity" className="mt-24" />;
}
