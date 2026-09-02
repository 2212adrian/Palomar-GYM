// src/components/ui/Modal.tsx
import React, { createContext, useContext } from 'react';
import { AnimatePresence, motion } from 'framer-motion';

// 1. Create a depth context to track nesting levels
const ModalDepthContext = createContext(0);

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  zIndex?: number; // Optional prop to manually override if needed
  className?: string; // Support layout/size customization
}

export const Modal: React.FC<ModalProps> = ({
  isOpen,
  onClose,
  title,
  children,
  zIndex: customZIndex,
  className = 'max-w-sm text-center p-8', // Default styles reside entirely here
}) => {
  // 2. Consume parent depth and calculate current depth
  const parentDepth = useContext(ModalDepthContext);
  const currentDepth = parentDepth + 1;

  // 3. Compute dynamic z-index. Base level is 1000, adding 10 per nesting level.
  const baseZIndex = 1000;
  const computedZIndex = customZIndex ?? baseZIndex + currentDepth * 10;

  return (
    <AnimatePresence>
      {isOpen && (
        /* Outer backdrop overlay with top/bottom safe-area padding & flex centering */
        <div
          className="fixed inset-0 flex items-center justify-center p-4 sm:p-6 overflow-y-auto pt-[calc(1.25rem+env(safe-area-inset-top))] pb-[calc(1.25rem+env(safe-area-inset-bottom))]"
          style={{ zIndex: computedZIndex }}
        >
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-black/80 backdrop-blur-md"
          />
          <motion.div
            initial={{ opacity: 0, y: 15, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 15, scale: 0.95 }}
            transition={{ duration: 0.25 }}
            /* Added my-auto, max-h-[85vh], sm:max-h-[90vh], and overflow-y-auto for safe viewport bounds */
            className={`relative bg-slate-50 dark:bg-[#17191c] border border-slate-200 dark:border-white/10 rounded-3xl w-full shadow-2xl space-y-4 font-body z-10 my-auto max-h-[85vh] sm:max-h-[90vh] overflow-y-auto ${className}`}
          >
            {title && (
              <h3 className="text-lg font-heading text-slate-900 dark:text-white uppercase tracking-wider">
                {title}
              </h3>
            )}

            {/* 4. Provide the incremented depth to any nested Modals inside children */}
            <ModalDepthContext.Provider value={currentDepth}>
              {children}
            </ModalDepthContext.Provider>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};
