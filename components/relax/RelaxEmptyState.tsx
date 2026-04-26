export function RelaxEmptyState() {
  return (
    <div
      className="relax-empty col aic gap-12"
      data-testid="relax-empty"
      style={{ paddingTop: 96, textAlign: 'center' }}
    >
      <div className="display" style={{ fontSize: 26, fontFamily: 'var(--serif)' }}>
        Earn some time first
      </div>
      <div className="body" style={{ color: 'var(--ink-mute)', maxWidth: 280 }}>
        Study a lesson to bank time, then relax.
      </div>
      <a
        href="/home"
        className="btn-accent mt-12"
        data-testid="relax-empty-cta"
      >
        Back to learning
      </a>
    </div>
  );
}
