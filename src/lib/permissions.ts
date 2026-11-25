// src/lib/permissions.ts
import { Capacitor } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';

export type PermissionState = 'granted' | 'denied' | 'prompt' | 'unsupported';

export interface HardwarePermissionsStatus {
  camera: PermissionState;
  notification: PermissionState;
}

/**
 * Check the current status of camera permission
 */
export async function getCameraPermissionStatus(): Promise<PermissionState> {
  if (typeof window === 'undefined' || !navigator?.mediaDevices) {
    return 'unsupported';
  }

  try {
    if (navigator.permissions && navigator.permissions.query) {
      const result = await navigator.permissions.query({
        name: 'camera' as any,
      });
      return result.state as PermissionState;
    }
  } catch {
    // navigator.permissions.query for camera may not be supported on all browsers
  }

  const stored = localStorage.getItem('palomar_camera_perm');
  if (stored === 'granted' || stored === 'denied')
    return stored as PermissionState;

  return 'prompt';
}

/**
 * Check the current status of notifications (Native & Web)
 */
export async function getNotificationPermissionStatus(): Promise<PermissionState> {
  if (Capacitor.isNativePlatform()) {
    try {
      const status = await LocalNotifications.checkPermissions();
      if (status.display === 'granted') return 'granted';
      if (status.display === 'denied') return 'denied';
      return 'prompt';
    } catch {
      return 'unsupported';
    }
  }

  if (typeof window === 'undefined' || !('Notification' in window)) {
    return 'unsupported';
  }

  if (Notification.permission === 'granted') return 'granted';
  if (Notification.permission === 'denied') return 'denied';
  return 'prompt';
}

/**
 * Request camera permission explicitly from user
 */
export async function requestCameraPermission(): Promise<PermissionState> {
  if (typeof window === 'undefined' || !navigator?.mediaDevices?.getUserMedia) {
    return 'unsupported';
  }

  try {
    const stream = await navigator.mediaDevices.getUserMedia({ video: true });
    stream.getTracks().forEach((track) => track.stop());
    localStorage.setItem('palomar_camera_perm', 'granted');
    return 'granted';
  } catch (err: any) {
    console.warn('Camera permission request denied or error:', err);
    localStorage.setItem('palomar_camera_perm', 'denied');
    return 'denied';
  }
}

/**
 * Request notification permission explicitly (Native & Web)
 */
export async function requestNotificationPermission(): Promise<PermissionState> {
  if (Capacitor.isNativePlatform()) {
    try {
      const result = await LocalNotifications.requestPermissions();
      return result.display === 'granted'
        ? 'granted'
        : result.display === 'denied'
          ? 'denied'
          : 'prompt';
    } catch (err) {
      console.warn('Native notification request error:', err);
      return 'denied';
    }
  }

  if (typeof window === 'undefined' || !('Notification' in window)) {
    return 'unsupported';
  }

  try {
    const permission = await Notification.requestPermission();
    return permission === 'granted'
      ? 'granted'
      : permission === 'denied'
        ? 'denied'
        : 'prompt';
  } catch (err) {
    console.warn('Notification permission request error:', err);
    return 'denied';
  }
}

/**
 * Send a notification (Cross-platform)
 */
export async function sendNotification(title: string, body: string): Promise<void> {
  if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
    return;
  }

  if (Capacitor.isNativePlatform()) {
    await LocalNotifications.schedule({
      notifications: [
        {
          title,
          body,
          id: Math.floor(Date.now() % 100000),
          schedule: { at: new Date(Date.now() + 200) },
        },
      ],
    });
    return;
  }

  if ('Notification' in window && Notification.permission === 'granted') {
    new Notification(title, {
      body,
      icon: '/favicon.ico',
    });
  }
}

/**
 * Initial permissions check for login (notifications & camera only — no GPS/location access)
 */
export async function promptInitialPermissionsOnLogin(): Promise<HardwarePermissionsStatus> {
  const notifStatus = await getNotificationPermissionStatus();
  let updatedNotif = notifStatus;
  if (notifStatus === 'prompt') {
    updatedNotif = await requestNotificationPermission();
  }

  const camStatus = await getCameraPermissionStatus();

  return {
    camera: camStatus,
    notification: updatedNotif,
  };
}