// src/components/common/VirtualWindowList.tsx
import React, {
  useState,
  useEffect,
  useRef,
  useCallback,
} from 'react';

export interface VirtualWindowListProps<T> {
  items: T[];
  estimateItemHeight: number;
  overscan?: number;
  className?: string;
  itemClassName?: string;
  renderItem: (item: T, index: number) => React.ReactNode;
  getItemKey?: (item: T, index: number) => string | number;
  /** When true (default), windowing only activates on mobile (< 1024px). On desktop it renders all items directly. */
  mobileOnly?: boolean;
}

function getScrollParent(node: HTMLElement | null): HTMLElement | Window {
  if (!node) return window;
  let parent = node.parentElement;
  while (parent) {
    const { overflowY } = window.getComputedStyle(parent);
    if (overflowY === 'auto' || overflowY === 'scroll') {
      return parent;
    }
    parent = parent.parentElement;
  }
  return window;
}

export function VirtualWindowList<T>({
  items,
  estimateItemHeight,
  overscan = 3,
  className = '',
  itemClassName = '',
  renderItem,
  getItemKey,
  mobileOnly = true,
}: VirtualWindowListProps<T>) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const scrollParentRef = useRef<HTMLElement | Window | null>(null);
  const measuredHeights = useRef<{ [index: number]: number }>({});

  const [isMobile, setIsMobile] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return window.innerWidth < 1024;
  });

  const [range, setRange] = useState<{ start: number; end: number }>({
    start: 0,
    end: Math.min(items.length, 12),
  });

  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 1024);
    };
    window.addEventListener('resize', checkMobile, { passive: true });
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  const updateVisibleRange = useCallback(() => {
    if (!containerRef.current) return;
    const container = containerRef.current;
    const parent = scrollParentRef.current;

    let scrollTop = 0;
    let viewportHeight = window.innerHeight;

    if (parent && parent !== window) {
      const parentEl = parent as HTMLElement;
      const parentRect = parentEl.getBoundingClientRect();
      const containerRect = container.getBoundingClientRect();
      scrollTop = Math.max(0, parentRect.top - containerRect.top);
      viewportHeight = parentEl.clientHeight;
    } else {
      const containerRect = container.getBoundingClientRect();
      scrollTop = Math.max(0, -containerRect.top);
      viewportHeight = window.innerHeight;
    }

    let currentOffset = 0;
    let start = 0;
    let foundStart = false;

    for (let i = 0; i < items.length; i++) {
      const h = measuredHeights.current[i] || estimateItemHeight;
      if (!foundStart && currentOffset + h >= scrollTop) {
        start = Math.max(0, i - overscan);
        foundStart = true;
      }
      if (foundStart && currentOffset > scrollTop + viewportHeight) {
        const end = Math.min(items.length, i + overscan);
        setRange({ start, end });
        return;
      }
      currentOffset += h;
    }

    setRange({
      start,
      end: items.length,
    });
  }, [items.length, estimateItemHeight, overscan]);

  useEffect(() => {
    if (mobileOnly && !isMobile) return;

    const scrollParent = getScrollParent(containerRef.current);
    scrollParentRef.current = scrollParent;

    let ticking = false;
    const onScroll = () => {
      if (!ticking) {
        ticking = true;
        requestAnimationFrame(() => {
          updateVisibleRange();
          ticking = false;
        });
      }
    };

    scrollParent.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll, { passive: true });

    updateVisibleRange();

    return () => {
      scrollParent.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
    };
  }, [items.length, isMobile, mobileOnly, updateVisibleRange]);

  // Desktop view: No windowing, renders all items directly to preserve desktop animations & styling
  if (mobileOnly && !isMobile) {
    return (
      <div className={className}>
        {items.map((item, index) => (
          <React.Fragment key={getItemKey ? getItemKey(item, index) : index}>
            {renderItem(item, index)}
          </React.Fragment>
        ))}
      </div>
    );
  }

  // Mobile virtualized rendering with top and bottom spacers
  let topSpacerHeight = 0;
  for (let i = 0; i < range.start; i++) {
    topSpacerHeight += measuredHeights.current[i] || estimateItemHeight;
  }

  let bottomSpacerHeight = 0;
  for (let i = range.end; i < items.length; i++) {
    bottomSpacerHeight += measuredHeights.current[i] || estimateItemHeight;
  }

  const visibleItems = items.slice(range.start, range.end);

  const measureItem = (index: number) => (el: HTMLDivElement | null) => {
    if (el) {
      const h = el.offsetHeight;
      if (h > 0 && measuredHeights.current[index] !== h) {
        measuredHeights.current[index] = h;
      }
    }
  };

  return (
    <div ref={containerRef} className={className}>
      {topSpacerHeight > 0 && (
        <div style={{ height: `${topSpacerHeight}px` }} aria-hidden="true" />
      )}
      {visibleItems.map((item, idx) => {
        const actualIndex = range.start + idx;
        const key = getItemKey ? getItemKey(item, actualIndex) : actualIndex;
        return (
          <div
            key={key}
            ref={measureItem(actualIndex)}
            className={itemClassName}
          >
            {renderItem(item, actualIndex)}
          </div>
        );
      })}
      {bottomSpacerHeight > 0 && (
        <div style={{ height: `${bottomSpacerHeight}px` }} aria-hidden="true" />
      )}
    </div>
  );
}

export default VirtualWindowList;
