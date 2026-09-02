// src/components/ui/Card.tsx
import React, { useState, useEffect } from 'react';

export interface CardProps {
  children: React.ReactNode;
  isFlipped?: boolean;
  isLoggingIn?: boolean;
  isReady?: boolean;
  className?: string;
  expandable?: boolean;
  badgeText?: string;
  showWave?: boolean;
  variant?: 'solid' | 'glass' | 'raw';
  onClick?: () => void;
}

export const Card: React.FC<CardProps> = ({
  children,
  isFlipped,
  className = 'w-[360px] sm:w-[410px] min-h-[670px]',
  expandable = false,
  badgeText,
  showWave = false,
  variant = 'solid',
  onClick,
}) => {
  const [mounted, setMounted] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);

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
    if (onClick) {
      onClick();
    }
  };

  const renderInnerContent = () => {
    if (variant === 'raw') {
      return children;
    }

    if (variant === 'glass') {
      return (
        <div className="relative overflow-hidden flex flex-col justify-between h-full bg-black/60 border border-white/10 p-6 rounded-2xl shadow-2xl backdrop-blur-md transition-all duration-300 font-body text-left">
          {children}
        </div>
      );
    }

    // Default solid design card shell (used for Login & Recovery)
    return (
      <div className="relative overflow-hidden flex flex-col justify-between h-full bg-white dark:bg-[#0e1117] border border-slate-200/80 dark:border-white/10 p-6 sm:p-7 rounded-[28px] shadow-2xl transition-colors duration-500">
        {/* Top Left Pill Badge */}
        {badgeText && (
          <div className="absolute top-5 left-5 z-20">
            <span className="text-[10px] font-mono font-bold px-3 py-1 rounded-full border border-blue-500/40 dark:border-red-500/40 text-blue-600 dark:text-red-400 bg-blue-50/80 dark:bg-red-500/10 uppercase tracking-widest backdrop-blur-md">
              {badgeText}
            </span>
          </div>
        )}

        {/* Top Right Decorative Wave Fluid SVG */}
        {showWave && (
          <div className="absolute top-0 right-0 w-36 h-24 overflow-hidden pointer-events-none rounded-tr-[28px] z-10">
            <svg
              viewBox="0 0 150 100"
              preserveAspectRatio="none"
              className="w-full h-full text-blue-600 dark:text-red-600 opacity-90 transition-colors duration-500"
            >
              <path fill="currentColor" d="M0,0 C50,40 100,0 150,60 L150,0 Z" />
            </svg>
          </div>
        )}

        {children}
      </div>
    );
  };

  return (
    <div
      onClick={handleClick}
      className={`flip-card transition-all duration-700 ease-[cubic-bezier(0.16,1,0.3,1)] select-none relative ${className} ${
        expandable ? 'cursor-pointer group' : ''
      } ${isExpanded ? 'expanded' : ''} ${mounted ? 'opacity-100' : 'opacity-0'}`}
    >
      <div
        className={`flip-card-inner h-full w-full ${isFlipped ? 'flipped' : ''}`}
      >
        {renderInnerContent()}
      </div>
    </div>
  );
};
