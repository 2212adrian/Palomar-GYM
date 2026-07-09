//src/components/ui/Card.tsx
import React, { useState, useEffect } from 'react';

interface CardProps {
  children: React.ReactNode;
  isFlipped?: boolean;
  isLoggingIn?: boolean;
  className?: string; // Optional custom dimensions
  expandable?: boolean; // New customizable expandable feature
}

export const Card: React.FC<CardProps> = ({ 
  children, 
  isFlipped, 
  isLoggingIn, 
  className = 'w-100 h-155',
  expandable = false 
}) => {
  const [mounted, setMounted] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);

  // Triggers fading intro on mount
  useEffect(() => {
    const timer = setTimeout(() => {
      setMounted(true);
    }, 50);
    return () => clearTimeout(timer);
  }, []);

  const handleClick = () => {
    if (expandable) {
      setIsExpanded(!isExpanded);
    }
  };

  return (
    <div 
      onClick={handleClick}
      className={`flip-card transition-all duration-700 ease-[cubic-bezier(0.16,1,0.3,1)] select-none ${className} ${
        mounted && !isLoggingIn 
          ? 'opacity-100 scale-100' 
          : 'opacity-0 scale-95 pointer-events-none'
      } ${expandable ? 'cursor-pointer group' : ''} ${isExpanded ? 'expanded' : ''}`}
    >
      <div className={`flip-card-inner h-full w-full ${isFlipped ? 'flipped' : ''}`}>
        {children}
      </div>
    </div>
  );
};