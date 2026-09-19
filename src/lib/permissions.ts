// src/lib/permissions.ts

export type PermissionState = 'granted' | 'denied' | 'prompt' | 'unsupported';

export interface HardwarePermissionsStatus {
  camera: PermissionState;
  location: PermissionState;
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
 * Check the current status of browser geolocation permission
 */
export async function getLocationPermissionStatus(): Promise<PermissionState> {
  if (typeof window === 'undefined' || !navigator?.geolocation) {
    return 'unsupported';
  }

  try {
    if (navigator.permissions && navigator.permissions.query) {
      const result = await navigator.permissions.query({
        name: 'geolocation' as any,
      });
      return result.state as PermissionState;
    }
  } catch {
    // navigator.permissions.query may fail in some environments
  }

  const stored = localStorage.getItem('palomar_location_perm');
  if (stored === 'granted' || stored === 'denied') {
    return stored as PermissionState;
  }

  return 'prompt';
}

/**
 * Request geolocation permission explicitly from user
 */
export async function requestLocationPermission(): Promise<PermissionState> {
  if (typeof window === 'undefined' || !navigator?.geolocation) {
    return 'unsupported';
  }

  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      () => {
        localStorage.setItem('palomar_location_perm', 'granted');
        resolve('granted');
      },
      (err) => {
        console.warn('Location permission request error:', err);
        if (err.code === err.PERMISSION_DENIED) {
          localStorage.setItem('palomar_location_perm', 'denied');
          resolve('denied');
        } else {
          resolve('prompt');
        }
      },
      { enableHighAccuracy: true, timeout: 8000 }
    );
  });
}

/**
 * Check hardware permissions status without prompting for camera before camera is opened
 */
export async function promptInitialPermissionsOnLogin(): Promise<HardwarePermissionsStatus> {
  const notifStatus = getNotificationPermissionStatus();
  let updatedNotif = notifStatus;
  if (notifStatus === 'prompt') {
    updatedNotif = await requestNotificationPermission();
  }

  // DO NOT prompt for camera permission on login.
  // Camera permission will only be requested when the camera is explicitly opened by the user.
  const camStatus = await getCameraPermissionStatus();
  const locStatus = await getLocationPermissionStatus();

  return {
    camera: camStatus,
    location: locStatus,
    notification: updatedNotif,
  };
}
