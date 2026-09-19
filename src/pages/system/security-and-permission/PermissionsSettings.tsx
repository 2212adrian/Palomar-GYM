// src/pages/system/security-and-permission/PermissionsSettings.tsx
import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Camera,
  Bell,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  RefreshCw,
  Video,
  VideoOff,
  Send,
  HelpCircle,
  ShieldCheck,
  Smartphone,
  SwitchCamera,
  MapPin,
  Navigation,
  Crosshair,
} from 'lucide-react';
import { toast } from 'react-toastify';
import { Html5Qrcode } from 'html5-qrcode';
import {
  getCameraPermissionStatus,
  getNotificationPermissionStatus,
  getLocationPermissionStatus,
  requestCameraPermission,
  requestNotificationPermission,
  requestLocationPermission,
  getCurrentCoordinates,
  sendNotification,
  type PermissionState,
} from '../../../lib/permissions';

export const PermissionsSettings: React.FC = () => {
  const [cameraStatus, setCameraStatus] = useState<PermissionState>('prompt');
  const [notificationStatus, setNotificationStatus] =
    useState<PermissionState>('prompt');
  const [locationStatus, setLocationStatus] =
    useState<PermissionState>('prompt');
  const [checking, setChecking] = useState(false);
  const [previewActive, setPreviewActive] = useState(false);
  const [, setPreviewStream] = useState<MediaStream | null>(null);
  const [feedResolution, setFeedResolution] = useState<string>('');

  // Location testing state
  const [isLocating, setIsLocating] = useState(false);
  const [testedCoords, setTestedCoords] = useState<{
    lat: number;
    lng: number;
    accuracy: number;
    timestamp: string;
  } | null>(null);

  // Camera Devices & Selection State (synced with ScannerPage)
  const [cameras, setCameras] = useState<Array<{ id: string; label: string }>>(
    []
  );
  const [selectedCameraId, setSelectedCameraId] = useState<string>(() => {
    return localStorage.getItem('preferred_camera_id') || '';
  });

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // Enumerate Connected Camera Devices
  const fetchCameras = async () => {
    try {
      const devices = await Html5Qrcode.getCameras();
      if (devices && devices.length > 0) {
        setCameras(devices);
        const savedCameraId = localStorage.getItem('preferred_camera_id');
        const cameraExists =
          savedCameraId && devices.some((d) => d.id === savedCameraId);

        if (cameraExists) {
          setSelectedCameraId(savedCameraId!);
        } else if (
          !selectedCameraId ||
          !devices.some((d) => d.id === selectedCameraId)
        ) {
          const backCam = devices.find(
            (d) =>
              d.label.toLowerCase().includes('back') ||
              d.label.toLowerCase().includes('rear') ||
              d.label.toLowerCase().includes('environment')
          );
          const defaultId = backCam ? backCam.id : devices[0].id;
          setSelectedCameraId(defaultId);
          localStorage.setItem('preferred_camera_id', defaultId);
        }
      }
    } catch (err) {
      console.warn('Camera enumeration error:', err);
    }
  };

  const refreshStatuses = async () => {
    setChecking(true);
    try {
      const cam = await getCameraPermissionStatus();
      const notif = await getNotificationPermissionStatus();
      const loc = await getLocationPermissionStatus();
      setCameraStatus(cam);
      setNotificationStatus(notif);
      setLocationStatus(loc);
      await fetchCameras();
    } finally {
      setChecking(false);
    }
  };

  useEffect(() => {
    refreshStatuses();
    return () => {
      stopCameraPreview();
    };
  }, []);

  const handleRequestCamera = async () => {
    const status = await requestCameraPermission();
    setCameraStatus(status);
    if (status === 'granted') {
      toast.success('Camera permission enabled successfully!');
      fetchCameras();
    } else if (status === 'denied') {
      toast.error(
        'Camera permission was blocked. Please check your app/browser permissions.'
      );
    }
  };

  const handleRequestNotification = async () => {
    const status = await requestNotificationPermission();
    setNotificationStatus(status);
    if (status === 'granted') {
      toast.success('Notification permission enabled successfully!');
      await sendNotification(
        'Palomar Gym Management',
        'Notifications are active and verified.'
      );
    } else if (status === 'denied') {
      toast.error(
        'Notification permission was blocked. Check your system or browser settings.'
      );
    }
  };

  const handleRequestLocation = async () => {
    const status = await requestLocationPermission();
    setLocationStatus(status);
    if (status === 'granted') {
      toast.success('Location permission enabled successfully!');
      await handleTestLocation();
    } else if (status === 'denied') {
      toast.error(
        'Location permission was denied. Please allow location access in your device settings.'
      );
    }
  };

  const handleTestLocation = async () => {
    setIsLocating(true);
    try {
      const coords = await getCurrentCoordinates();
      setLocationStatus('granted');
      setTestedCoords({
        lat: coords.latitude,
        lng: coords.longitude,
        accuracy: coords.accuracy,
        timestamp: new Date().toLocaleTimeString(),
      });
      toast.success(
        `GPS Acquired: ${coords.latitude.toFixed(5)}, ${coords.longitude.toFixed(5)} (±${coords.accuracy}m)`
      );
    } catch (err: any) {
      console.warn('Location test error:', err);
      if (err.code === 1 || err.message?.toLowerCase().includes('denied')) {
        setLocationStatus('denied');
        toast.error('Location permission was denied in device settings.');
      } else {
        toast.error(
          'Location error: ' + (err.message || 'Position unavailable')
        );
      }
    } finally {
      setIsLocating(false);
    }
  };

  const stopCameraPreview = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => {
        track.stop();
        track.enabled = false;
      });
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setPreviewStream(null);
    setPreviewActive(false);
    setFeedResolution('');
  };

  // Callback ref ensures srcObject is assigned as soon as the <video> DOM element mounts
  const setVideoRef = useCallback((element: HTMLVideoElement | null) => {
    videoRef.current = element;
    if (element && streamRef.current) {
      element.srcObject = streamRef.current;
      element.muted = true;
      element.play().catch((err) => {
        console.warn('Autoplay error on mount:', err);
      });
    }
  }, []);

  const startCameraPreview = async (deviceId?: string) => {
    stopCameraPreview();
    const activeId = deviceId || selectedCameraId;

    try {
      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: activeId
            ? {
                deviceId: { exact: activeId },
                width: { ideal: 1280 },
                height: { ideal: 720 },
              }
            : { width: { ideal: 1280 }, height: { ideal: 720 } },
        });
      } catch {
        stream = await navigator.mediaDevices.getUserMedia({
          video: activeId ? { deviceId: activeId } : true,
        });
      }

      streamRef.current = stream;
      setPreviewStream(stream);
      setPreviewActive(true);
      setCameraStatus('granted');

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.muted = true;
        await videoRef.current.play().catch(() => {});
      }

      fetchCameras();
    } catch (err: any) {
      console.error('Camera preview error:', err);
      toast.error(
        'Could not access camera. Ensure it is connected and not in use by another app.'
      );
      setCameraStatus('denied');
    }
  };

  const handleCameraChange = (cameraId: string) => {
    setSelectedCameraId(cameraId);
    localStorage.setItem('preferred_camera_id', cameraId);
    const chosen = cameras.find((c) => c.id === cameraId);
    toast.info(`Switched to: ${chosen?.label || 'Camera'}`);

    if (previewActive) {
      startCameraPreview(cameraId);
    }
  };

  const handleCycleCamera = () => {
    if (cameras.length <= 1) return;
    const currentIndex = cameras.findIndex((c) => c.id === selectedCameraId);
    const nextIndex = (currentIndex + 1) % cameras.length;
    handleCameraChange(cameras[nextIndex].id);
  };

  const handleSendTestNotification = async () => {
    if (notificationStatus !== 'granted') {
      toast.warning('Please enable notification permissions first.');
      return;
    }
    try {
      await sendNotification(
        'Palomar Gym System Alert',
        'System notification verification successful. Real-time alerts are operational.'
      );
      toast.success('Test notification triggered.');
    } catch (err: any) {
      toast.error('Failed to trigger notification: ' + (err.message || err));
    }
  };

  const renderStatusBadge = (status: PermissionState) => {
    switch (status) {
      case 'granted':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-heading font-black tracking-wider uppercase bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30">
            <CheckCircle2 className="w-3.5 h-3.5" />
            Active & Allowed
          </span>
        );
      case 'denied':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-heading font-black tracking-wider uppercase bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/30">
            <XCircle className="w-3.5 h-3.5" />
            Blocked / Denied
          </span>
        );
      case 'unsupported':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-heading font-black tracking-wider uppercase bg-slate-500/10 text-slate-600 dark:text-slate-400 border border-slate-500/30">
            <HelpCircle className="w-3.5 h-3.5" />
            Unsupported
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-heading font-black tracking-wider uppercase bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/30">
            <AlertTriangle className="w-3.5 h-3.5" />
            Disabled / Needs Permission
          </span>
        );
    }
  };

  return (
    <div className="w-full flex justify-center py-2">
      <div className="w-full max-w-4xl space-y-6">
        {/* Header Info */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-5 border-b border-slate-200 dark:border-zinc-800">
          <div>
            <h2 className="text-xl font-heading font-black uppercase tracking-tight text-slate-900 dark:text-white flex items-center gap-2.5">
              <ShieldCheck className="w-6 h-6 text-purple-600 dark:text-purple-400" />
              Hardware & Device Permissions
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 font-medium">
              Manage system and hardware access for camera (QR scanning, member
              photos), location (GPS check-ins), and push notifications.
            </p>
          </div>

          <button
            type="button"
            onClick={refreshStatuses}
            disabled={checking}
            className="inline-flex items-center justify-center gap-2 px-3.5 py-2 rounded-xl text-xs font-heading font-black uppercase tracking-wider bg-slate-100 dark:bg-zinc-800 hover:bg-slate-200 dark:hover:bg-zinc-700 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-zinc-700 transition-colors cursor-pointer shadow-xs shrink-0"
          >
            <RefreshCw
              className={`w-3.5 h-3.5 ${checking ? 'animate-spin' : ''}`}
            />
            <span>Re-check Status</span>
          </button>
        </div>

        {/* Permissions Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5 items-start">
          {/* CAMERA CARD */}
          <div className="p-5 rounded-2xl bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 shadow-xs flex flex-col justify-between space-y-4">
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="w-10 h-10 rounded-xl bg-purple-500/10 dark:bg-purple-950/50 border border-purple-500/20 text-purple-600 dark:text-purple-400 flex items-center justify-center">
                  <Camera className="w-5 h-5" />
                </div>
                {renderStatusBadge(cameraStatus)}
              </div>

              <div>
                <h3 className="text-sm font-heading font-bold text-slate-900 dark:text-white uppercase tracking-wide">
                  Camera Access
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">
                  Required for scanning member QR passes, barcode scanning in
                  POS, and capturing new member profile photos.
                </p>
              </div>

              {/* CAMERA SELECTOR / SWITCHER */}
              {cameras.length > 0 && (
                <div className="p-3 rounded-xl bg-slate-100/80 dark:bg-zinc-900/90 border border-slate-200 dark:border-zinc-800 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-heading font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                      <Camera className="w-3.5 h-3.5 text-purple-500" />
                      Active Camera Lens
                    </span>
                    {cameras.length > 1 && (
                      <button
                        type="button"
                        onClick={handleCycleCamera}
                        className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-purple-600 dark:text-purple-400 hover:text-purple-500 cursor-pointer"
                        title="Switch to next camera"
                      >
                        <SwitchCamera className="w-3 h-3" />
                        <span>Switch</span>
                      </button>
                    )}
                  </div>

                  <select
                    value={selectedCameraId}
                    onChange={(e) => handleCameraChange(e.target.value)}
                    className="w-full px-2.5 py-1.5 bg-white dark:bg-zinc-950 border border-slate-300 dark:border-zinc-700 rounded-lg text-xs font-semibold text-slate-800 dark:text-slate-200 outline-none focus:ring-2 focus:ring-purple-500/30 cursor-pointer truncate"
                  >
                    {cameras.map((cam, idx) => (
                      <option
                        key={cam.id}
                        value={cam.id}
                        className="bg-white dark:bg-zinc-900 text-slate-800 dark:text-slate-200"
                      >
                        {cam.label || `Camera ${idx + 1}`}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {cameraStatus === 'denied' && (
                <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-xs text-rose-700 dark:text-rose-300 space-y-1.5">
                  <p className="font-bold flex items-center gap-1.5">
                    <AlertTriangle className="w-4 h-4 shrink-0 text-rose-500" />
                    Camera is Blocked
                  </p>
                  <p className="text-[11px] opacity-90 leading-normal">
                    To enable camera access, check your app/browser permission
                    settings, allow <strong>Camera</strong>, then tap Re-check.
                  </p>
                </div>
              )}
            </div>

            <div className="pt-2 border-t border-slate-200 dark:border-zinc-800 flex flex-wrap items-center gap-2.5">
              {cameraStatus !== 'granted' ? (
                <button
                  type="button"
                  onClick={handleRequestCamera}
                  className="flex-1 py-2.5 px-4 rounded-xl bg-purple-600 hover:bg-purple-700 text-white text-xs font-heading font-black uppercase tracking-wider transition-all cursor-pointer shadow-sm active:scale-95 text-center"
                >
                  Enable Camera Access
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() =>
                    previewActive ? stopCameraPreview() : startCameraPreview()
                  }
                  className={`flex-1 py-2.5 px-4 rounded-xl text-xs font-heading font-black uppercase tracking-wider transition-all cursor-pointer shadow-sm flex items-center justify-center gap-2 ${
                    previewActive
                      ? 'bg-rose-600 hover:bg-rose-700 text-white'
                      : 'bg-slate-100 hover:bg-slate-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-slate-800 dark:text-white border border-slate-200 dark:border-zinc-700'
                  }`}
                >
                  {previewActive ? (
                    <VideoOff className="w-4 h-4" />
                  ) : (
                    <Video className="w-4 h-4" />
                  )}
                  <span>
                    {previewActive
                      ? 'Stop Live Preview'
                      : 'Test Camera Preview'}
                  </span>
                </button>
              )}
            </div>

            {/* Live Camera Preview Box */}
            {previewActive && (
              <div className="mt-3 relative rounded-2xl overflow-hidden bg-zinc-950 aspect-video border border-zinc-700 shadow-inner flex items-center justify-center">
                <video
                  ref={setVideoRef}
                  className="w-full h-full object-cover"
                  autoPlay
                  playsInline
                  muted
                  onLoadedMetadata={(e) => {
                    const target = e.currentTarget;
                    if (target.videoWidth && target.videoHeight) {
                      setFeedResolution(
                        `${target.videoWidth}x${target.videoHeight}`
                      );
                    }
                    target.play().catch(() => {});
                  }}
                />

                <div className="absolute top-2.5 left-2.5 flex items-center gap-1.5 z-10">
                  <span className="px-2 py-0.5 rounded-md bg-emerald-600/90 backdrop-blur-md text-white text-[10px] font-heading font-black uppercase shadow-xs">
                    Live Feed {feedResolution ? `(${feedResolution})` : 'OK'}
                  </span>
                </div>

                {cameras.length > 1 && (
                  <button
                    type="button"
                    onClick={handleCycleCamera}
                    className="absolute top-2.5 right-2.5 px-2.5 py-1 rounded-xl bg-black/75 hover:bg-black/90 backdrop-blur-md text-white border border-white/20 text-[10px] font-bold uppercase tracking-wider flex items-center gap-1.5 transition-all cursor-pointer shadow-md active:scale-95 z-10"
                  >
                    <SwitchCamera className="w-3.5 h-3.5 text-purple-400" />
                    <span>Switch Lens</span>
                  </button>
                )}
              </div>
            )}
          </div>

          {/* LOCATION PERMISSION CARD */}
          <div className="p-5 rounded-2xl bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 shadow-xs flex flex-col justify-between space-y-4">
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="w-10 h-10 rounded-xl bg-blue-500/10 dark:bg-blue-950/50 border border-blue-500/20 text-blue-600 dark:text-blue-400 flex items-center justify-center">
                  <MapPin className="w-5 h-5" />
                </div>
                {renderStatusBadge(locationStatus)}
              </div>

              <div>
                <h3 className="text-sm font-heading font-bold text-slate-900 dark:text-white uppercase tracking-wide">
                  Location (GPS) Access
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">
                  Required for perimeter geofence validation, facility check-in
                  verification, and terminal security.
                </p>
              </div>

              {/* Tested GPS Diagnostics Badge */}
              {testedCoords && (
                <div className="p-3 rounded-xl bg-blue-500/10 dark:bg-blue-950/40 border border-blue-500/20 text-blue-700 dark:text-blue-300 space-y-1">
                  <div className="flex items-center justify-between text-[11px] font-bold">
                    <span className="flex items-center gap-1">
                      <Crosshair className="w-3.5 h-3.5 text-blue-500" />
                      Current Device Coordinates
                    </span>
                    <span className="font-mono text-[10px] opacity-75">
                      {testedCoords.timestamp}
                    </span>
                  </div>
                  <p className="text-xs font-mono font-bold tracking-tight">
                    {testedCoords.lat}, {testedCoords.lng}
                  </p>
                  <p className="text-[10px] opacity-80">
                    GPS Accuracy: ±{testedCoords.accuracy} meters
                  </p>
                </div>
              )}

              {locationStatus === 'denied' && (
                <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-xs text-rose-700 dark:text-rose-300 space-y-1.5">
                  <p className="font-bold flex items-center gap-1.5">
                    <AlertTriangle className="w-4 h-4 shrink-0 text-rose-500" />
                    Location Access is Denied
                  </p>
                  <p className="text-[11px] opacity-90 leading-normal">
                    To enable location, check your device/browser App Settings
                    and allow <strong>Location</strong>, then test again.
                  </p>
                </div>
              )}
            </div>

            <div className="pt-2 border-t border-slate-200 dark:border-zinc-800 flex flex-wrap items-center gap-2.5">
              {locationStatus !== 'granted' ? (
                <button
                  type="button"
                  onClick={handleRequestLocation}
                  className="flex-1 py-2.5 px-4 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-heading font-black uppercase tracking-wider transition-all cursor-pointer shadow-sm active:scale-95 text-center"
                >
                  Enable Location Access
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleTestLocation}
                  disabled={isLocating}
                  className="flex-1 py-2.5 px-4 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-slate-800 dark:text-white border border-slate-200 dark:border-zinc-700 text-xs font-heading font-black uppercase tracking-wider transition-all cursor-pointer shadow-sm flex items-center justify-center gap-2"
                >
                  <Navigation
                    className={`w-4 h-4 text-blue-500 ${isLocating ? 'animate-spin' : ''}`}
                  />
                  <span>
                    {isLocating ? 'Acquiring GPS...' : 'Test Device GPS'}
                  </span>
                </button>
              )}
            </div>
          </div>

          {/* NOTIFICATION CARD */}
          <div className="p-5 rounded-2xl bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 shadow-xs flex flex-col justify-between space-y-4">
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="w-10 h-10 rounded-xl bg-purple-500/10 dark:bg-purple-950/50 border border-purple-500/20 text-purple-600 dark:text-purple-400 flex items-center justify-center">
                  <Bell className="w-5 h-5" />
                </div>
                {renderStatusBadge(notificationStatus)}
              </div>

              <div>
                <h3 className="text-sm font-heading font-bold text-slate-900 dark:text-white uppercase tracking-wide">
                  Push Notifications
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">
                  Receive instant alerts for incident reports, low stock items,
                  and expiring member subscriptions.
                </p>
              </div>

              {notificationStatus === 'denied' && (
                <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-xs text-rose-700 dark:text-rose-300 space-y-1.5">
                  <p className="font-bold flex items-center gap-1.5">
                    <AlertTriangle className="w-4 h-4 shrink-0 text-rose-500" />
                    Notifications Blocked
                  </p>
                  <p className="text-[11px] opacity-90 leading-normal">
                    To receive alert notifications, open your device/browser App
                    Settings and switch <strong>Notifications</strong> to{' '}
                    <em>"Allow"</em>.
                  </p>
                </div>
              )}
            </div>

            <div className="pt-2 border-t border-slate-200 dark:border-zinc-800 flex flex-wrap items-center gap-2.5">
              {notificationStatus !== 'granted' ? (
                <button
                  type="button"
                  onClick={handleRequestNotification}
                  className="flex-1 py-2.5 px-4 rounded-xl bg-purple-600 hover:bg-purple-700 text-white text-xs font-heading font-black uppercase tracking-wider transition-all cursor-pointer shadow-sm active:scale-95 text-center"
                >
                  Enable Push Notifications
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleSendTestNotification}
                  className="flex-1 py-2.5 px-4 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-slate-800 dark:text-white border border-slate-200 dark:border-zinc-700 text-xs font-heading font-black uppercase tracking-wider transition-all cursor-pointer shadow-sm flex items-center justify-center gap-2"
                >
                  <Send className="w-4 h-4 text-purple-500" />
                  <span>Send Test Alert</span>
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Device Guidance Note */}
        <div className="p-4 rounded-2xl bg-purple-500/5 border border-purple-500/20 text-xs text-slate-600 dark:text-slate-300 flex items-start gap-3">
          <Smartphone className="w-5 h-5 text-purple-600 dark:text-purple-400 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <p className="font-heading font-bold uppercase text-slate-900 dark:text-white">
              Device & Security Permissions Behavior
            </p>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed font-medium">
              Once a hardware permission is denied by the user, operating system
              security policies prevent prompts from reopening automatically.
              You can re-enable access anytime via the browser address bar icon
              or your device's <em>App Info &gt; Permissions</em> settings.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
