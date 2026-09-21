import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronLeft, ChevronRight } from 'lucide-react';

interface SideNavTabProps {
  side: 'left' | 'right';
  label: string;
  onClick: () => void;
  title?: string;
  sidebarOffset?: boolean;
}

export const SideNavTab: React.FC<SideNavTabProps> = ({
  side,
  label,
  onClick,
  title,
}) => {
  const isLeft = side === 'left';
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) return null;

  const portalTarget = isLeft
    ? document.getElementById('desktop-sidebar-nav-portal') || document.body
    : document.body;

  const isAttachedToSidebar = isLeft && portalTarget !== document.body;

  const roundedClass = isLeft
    ? 'rounded-r-3xl border-y border-r'
    : 'rounded-l-3xl border-y border-l';

  const positionClass = isAttachedToSidebar
    ? 'relative'
    : isLeft
      ? 'fixed left-0 top-1/2 -translate-y-1/2'
      : 'fixed right-0 top-1/2 -translate-y-1/2';

  return createPortal(
    <div className="hidden lg:block select-none pointer-events-none">
      <AnimatePresence>
        <motion.button
          key={`sidenav-${side}-${label}`}
          initial={{ opacity: 0, x: isLeft ? -20 : 20 }}
          animate={{ opacity: 0.95, x: 0 }}
          exit={{ opacity: 0, x: isLeft ? -20 : 20 }}
          whileHover={{ scale: 1.05, opacity: 1 }}
          onClick={onClick}
          title={title || `Go to ${label}`}
          className={`pointer-events-auto ${positionClass} z-[90] bg-white/95 dark:bg-[#161920]/95 backdrop-blur-md ${roundedClass} border-slate-200 dark:border-zinc-800 py-6 px-3.5 shadow-2xl cursor-pointer flex flex-col items-center gap-3.5 transition-all hover:border-blue-500/60 dark:hover:border-red-500/60 hover:bg-white dark:hover:bg-[#1c202a]`}
        >
          {isLeft && (
            <motion.div
              animate={{ x: [0, -4, 0] }}
              transition={{
                repeat: Infinity,
                duration: 1.5,
                ease: 'easeInOut',
              }}
            >
              <ChevronLeft className="w-5 h-5 text-blue-600 dark:text-red-500" />
            </motion.div>
          )}

          <span
            className={`[writing-mode:vertical-rl] font-heading text-xs font-black tracking-widest uppercase text-slate-500 dark:text-zinc-400 group-hover:text-blue-600 dark:group-hover:text-red-500 transition-colors select-none ${
              isLeft ? 'rotate-180' : ''
            }`}
          >
            {label}
          </span>

          {!isLeft && (
            <motion.div
              animate={{ x: [0, 4, 0] }}
              transition={{
                repeat: Infinity,
                duration: 1.5,
                ease: 'easeInOut',
              }}
            >
              <ChevronRight className="w-5 h-5 text-blue-600 dark:text-red-500" />
            </motion.div>
          )}
        </motion.button>
      </AnimatePresence>
    </div>,
    portalTarget
  );
};
