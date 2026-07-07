import { useState, useEffect } from 'react';

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

  useEffect(() => {
    const handleResize = () => {
      setItemsPerPage(getItemsPerPage());
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  return itemsPerPage;
}