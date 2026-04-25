'use client';

/**
 * Stub. Real implementation lands in Task 4. Index page mounts this
 * to satisfy the "+ 新分类" tile testid; Task 4 wires it to the API.
 */
export function NewCategoryForm() {
  return (
    <button
      type="button"
      className="card"
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        cursor: 'pointer',
        borderStyle: 'dashed',
        minHeight: 120,
        color: 'var(--ink-mute)',
        background: 'transparent',
      }}
      disabled
      data-testid="admin-new-category-tile"
    >
      + 新分类 (todo)
    </button>
  );
}
