// src/components/common/SyncConflictDashboard.tsx
import React from 'react';

interface SyncConflictDashboardProps {
  isOpen: boolean;
  onClose: () => void;
}

/**
 * Offline sync has been decommissioned.
 * All mutations require an active internet connection.
 */
export const SyncConflictDashboard: React.FC<SyncConflictDashboardProps> = () => {
  return null;
};