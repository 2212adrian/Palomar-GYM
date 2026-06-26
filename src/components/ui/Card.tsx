//src/components/ui/Card.tsx
import React from 'react';

interface CardProps {
  children: React.ReactNode;
  isFlipped?: boolean;
  isLoggingIn?: boolean;
}

export const Card: React.FC<CardProps> = ({ children, isFlipped, isLoggingIn }) => {
  return (
    <div className={`flip-card transition-all duration-500 ${isLoggingIn ? 'opacity-0 scale-95 pointer-events-none' : ''}`}>
      <div className={`flip-card-inner ${isFlipped ? 'flipped' : ''}`}>
        {children}
      </div>
    </div>
  );
};