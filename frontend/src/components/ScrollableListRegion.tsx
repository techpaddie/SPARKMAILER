import type { CSSProperties, ReactNode } from 'react';

/**
 * Constrains list/table content with an internal scroll (viewport-height aware).
 * Use for any long list or wide table so the page layout stays usable.
 */
export function ScrollableListRegion({
  children,
  ariaLabel = 'Scrollable list',
  className = '',
  maxHeightClass = 'max-h-[min(70vh,560px)]',
}: {
  children: ReactNode;
  ariaLabel?: string;
  className?: string;
  /** Tailwind max-height classes (default matches campaign/tracking tables) */
  maxHeightClass?: string;
}) {
  return (
    <div
      className={`w-full min-h-0 overflow-y-auto overflow-x-auto overscroll-y-contain ${maxHeightClass} ${className}`.trim()}
      style={{ WebkitOverflowScrolling: 'touch' } as CSSProperties}
      role="region"
      aria-label={ariaLabel}
    >
      {children}
    </div>
  );
}
