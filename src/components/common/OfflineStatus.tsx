// src/components/common/OfflineStatus.tsx
import React, { useState, useEffect } from 'react';
import { WifiOff, Wifi } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { Network } from '@capacitor/network';

interface OfflineStatusProps {
  className?: string;
  position?: 'bottom-left' | 'bottom-right' | 'top-center' | 'bottom-center';
}

/**
 * OfflineStatus component:
 * Detects navigator.onLine changes and displays a subtle badge in the UI when the connection is lost.
 * Gracefully shows a brief 'Back Online' notification before disappearing.
 */
export const OfflineStatus: React.FC<OfflineStatusProps> = ({
  className = '',
  position = 'bottom-left',
}) => {
  const [isOnline, setIsOnline] = useState<boolean>(() => {
    return typeof navigator !== 'undefined' ? navigator.onLine : true;
  });
  const [wasOffline, setWasOffline] = useState<boolean>(false);
  const [showReconnected, setShowReconnected] = useState<boolean>(false);

  useEffect(() => {
    let reconnectTimeout: any = null;

    const handleStatusChange = (online: boolean) => {
      if (online) {
        setIsOnline(true);
        if (wasOffline) {
          setShowReconnected(true);
          clearTimeout(reconnectTimeout);
          reconnectTimeout = setTimeout(() => {
            setShowReconnected(false);
            setWasOffline(false);
          }, 2500);
        }
      } else {
        clearTimeout(reconnectTimeout);
        setShowReconnected(false);
        setIsOnline(false);
        setWasOffline(true);
      }
    };

    const handleWindowOnline = () => handleStatusChange(true);
    const handleWindowOffline = () => handleStatusChange(false);

    if (typeof window !== 'undefined') {
      window.addEventListener('online', handleWindowOnline);
      window.addEventListener('offline', handleWindowOffline);
    }

    // Also register native network listener for Capacitor platform
    let capNetworkListener: any = null;
    try {
      Network.getStatus().then((status) => {
        handleStatusChange(status.connected);
      }).catch(() => {
        // Fallback to window events
      });

      Network.addListener('networkStatusChange', (status) => {
        handleStatusChange(status.connected);
      }).then((listener) => {
        capNetworkListener = listener;
      }).catch(() => {
        // Fallback
      });
    } catch {
      // Ignore Capacitor registration error on non-native environments
    }

    return () => {
      if (typeof window !== 'undefined') {
        window.removeEventListener('online', handleWindowOnline);
        window.removeEventListener('offline', handleWindowOffline);
      }
      if (capNetworkListener && typeof capNetworkListener.remove === 'function') {
        capNetworkListener.remove();
      }
      clearTimeout(reconnectTimeout);
    };
  }, [wasOffline]);

  const positionClasses = {
    'bottom-left': 'bottom-4 left-4',
    'bottom-right': 'bottom-4 right-4',
    'top-center': 'top-4 left-1/2 -translate-x-1/2',
    'bottom-center': 'bottom-4 left-1/2 -translate-x-1/2',
  }[position];

  return (
    <AnimatePresence>
      {!isOnline && (
        <motion.div
          key="offline-badge"
          initial={{ opacity: 0, y: 10, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 8, scale: 0.95 }}
          transition={{ duration: 0.2 }}
          className={`fixed ${positionClasses} z-50 select-none pointer-events-none ${className}`}
        >
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/90 dark:bg-zinc-900/90 border border-rose-500/30 dark:border-rose-500/40 text-rose-600 dark:text-rose-400 text-xs font-heading font-bold shadow-lg backdrop-blur-md pointer-events-auto">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-rose-500" />
            </span>
            <WifiOff className="w-3.5 h-3.5 text-rose-500" />
            <span className="tracking-wide uppercase text-[10px]">Offline</span>
          </div>
        </motion.div>
      )}

      {showReconnected && (
        <motion.div
          key="reconnected-badge"
          initial={{ opacity: 0, y: 10, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 8, scale: 0.95 }}
          transition={{ duration: 0.2 }}
          className={`fixed ${positionClasses} z-50 select-none pointer-events-none ${className}`}
        >
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/90 dark:bg-zinc-900/90 border border-emerald-500/30 dark:border-emerald-500/40 text-emerald-600 dark:text-emerald-400 text-xs font-heading font-bold shadow-lg backdrop-blur-md pointer-events-auto">
            <Wifi className="w-3.5 h-3.5 text-emerald-500" />
            <span className="tracking-wide uppercase text-[10px]">Back Online</span>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
