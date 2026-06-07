'use client'

/**
 * KanbanDropLine — insertion-point indicator for kanban drag-and-drop.
 *
 * Renders a 2 px primary-coloured horizontal line with a circle cap on the
 * left. Appears between cards to show exactly where the dragged card will land.
 * Visibility is controlled by the `active` prop so the parent can keep the
 * element in the DOM (avoiding layout jank from mount/unmount on every
 * onDragOver tick) and just toggle visibility.
 */
export function KanbanDropLine({ active }: { active: boolean }) {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none relative flex items-center"
      style={{
        height: active ? 10 : 0,
        opacity: active ? 1 : 0,
        overflow: 'hidden',
        transition: 'height 80ms ease, opacity 80ms ease',
        marginLeft: 4,
        marginRight: 4,
      }}
    >
      {/* Circle cap */}
      <div
        className="shrink-0 rounded-full bg-primary"
        style={{ width: 8, height: 8, marginRight: -4 }}
      />
      {/* Line */}
      <div className="h-0.5 flex-1 bg-primary" />
    </div>
  )
}
