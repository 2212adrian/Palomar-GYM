// src/pages/system/components/CsvDataMigrationModal.tsx
import React from 'react';
import { createPortal } from 'react-dom';
import { useAuthStore } from '../../../stores/authStore';
import { isSuperAdmin } from '../../../constants/auth';
import { DatabaseMigrationManager } from './DatabaseMigrationManager';

interface CsvDataMigrationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

export const CsvDataMigrationModal: React.FC<CsvDataMigrationModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
}) => {
  const { user, profile } = useAuthStore() as any;
  const isSuper = isSuperAdmin(user?.email || profile?.email || null);

  if (!isOpen || !isSuper) return null;

  return createPortal(
    <div className="fixed inset-0 z-[2600] flex items-center justify-center p-2.5 sm:p-4 bg-black/80 backdrop-blur-md animate-fade-in font-sans select-none">
      <DatabaseMigrationManager
        embedded={false}
        onClose={onClose}
        onSuccess={onSuccess}
      />
    </div>,
    document.body
  );
};
