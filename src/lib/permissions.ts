// src/lib/permissions.ts

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
 * Check the current status of browser notifications
 */
export function getNotificationPermissionStatus(): PermissionState {
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
    // Immediately stop tracks to release hardware
    stream.getTracks().forEach((track) => track.stop());
    localStorage.setItem('palomar_camera_perm', 'granted');
    return 'granted';
  } catch (err: any) {
    console.warn('Camera permission request denied or error:', err);
    if (
      err.name === 'NotAllowedError' ||
      err.name === 'PermissionDeniedError'
    ) {
      localStorage.setItem('palomar_camera_perm', 'denied');
      return 'denied';
    }
    return 'denied';
  }
}

/**
 * Request notification permission explicitly from user
 */
export async function requestNotificationPermission(): Promise<PermissionState> {
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
 * Automatically prompt for required camera and notification permissions on authentication
 */
export async function promptInitialPermissionsOnLogin(): Promise<HardwarePermissionsStatus> {
  const notifStatus = getNotificationPermissionStatus();
  let updatedNotif = notifStatus;
  if (notifStatus === 'prompt') {
    updatedNotif = await requestNotificationPermission();
  }

  const camStatus = await getCameraPermissionStatus();
  let updatedCam = camStatus;
  if (camStatus === 'prompt') {
    updatedCam = await requestCameraPermission();
  }

  return {
    camera: updatedCam,
    notification: updatedNotif,
  };
}
