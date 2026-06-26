//src/components/ui/Modal.tsx
import React from 'react';
import { AnimatePresence, motion } from 'framer-motion';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}

export const Modal: React.FC<ModalProps> = ({ isOpen, onClose, title, children }) => {
  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-12000 flex items-center justify-center p-4">
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
            className="relative bg-slate-50 dark:bg-[#17191c] border border-slate-200 dark:border-white/10 rounded-3xl p-8 max-w-sm w-full text-center shadow-2xl space-y-4 font-body z-10"
          >
            <h3 className="text-lg font-heading text-slate-900 dark:text-white uppercase tracking-wider">
              {title}
            </h3>
            {children}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};