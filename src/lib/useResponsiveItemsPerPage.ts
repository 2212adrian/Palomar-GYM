// src/lib/useResponsiveItemsPerPage.ts
import { useState, useEffect, useRef } from 'react';

export function useResponsiveItemsPerPage() {
  const getItemsPerPage = () => {
    if (typeof window === 'undefined') return 25; // Safe fallback
    const width = window.innerWidth;

    if (width < 768) {
      return 10; // Mobile
    } else if (width < 1024) {
      return 15; // Tablet
    } else {
      return 25; // Desktop (Default)
    }
  };

  const [itemsPerPage, setItemsPerPage] = useState(getItemsPerPage);
  const lastWidthRef = useRef<number>(
    typeof window !== 'undefined' ? window.innerWidth : 0
  );

  useEffect(() => {
    const handleResize = () => {
      const currentWidth = window.innerWidth;
      if (currentWidth === lastWidthRef.current) return;
      lastWidthRef.current = currentWidth;
      const next = getItemsPerPage();
      setItemsPerPage((prev) => (prev === next ? prev : next));
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  return itemsPerPage;
}
