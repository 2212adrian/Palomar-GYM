// src/pages/system/security-and-permission/SecuritySettings.tsx
import React, { useState, useEffect, useRef } from 'react';
import {
  ShieldAlert,
  MapPin,
  Wifi,
  Radio,
  Sliders,
  Plus,
  Trash2,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  LocateFixed,
  Lock,
  Save,
  Info,
  Server,
  ShieldCheck,
  Crosshair,
  Navigation,
} from 'lucide-react';
import { toast } from 'react-toastify';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import {
  type SecurityAccessConfig,
  type TrustedWifiNetwork,
  DEFAULT_SECURITY_CONFIG,
  calculateDistanceMeters,
  getCurrentDevicePosition,
  getDeviceNetworkStatus,
} from '../../../lib/securityAccessService';
import { useSecurityStore } from '../../../stores/useSecurityStore';
import { useAuthStore } from '../../../stores/authStore';
import { isSuperAdmin } from '../../../constants/auth';

const GYM_PIN_ICON = L.divIcon({
  className: 'gym-marker-icon',
  html: `<div style="background:#bf0202;width:34px;height:34px;border-radius:50%;display:flex;align-items:center;justify-content:center;color:white;box-shadow:0 4px 14px rgba(0,0,0,0.45);border:2px solid white;transform:translate(-50%, -50%);">
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
      <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/>
      <circle cx="12" cy="10" r="3"/>
    </svg>
  </div>`,
  iconSize: [0, 0],
});

const DEVICE_PIN_ICON = L.divIcon({
  className: 'device-marker-icon',
  html: `<div style="background:#2563eb;width:24px;height:24px;border-radius:50%;display:flex;align-items:center;justify-content:center;color:white;box-shadow:0 2px 8px rgba(0,0,0,0.35);border:2px solid white;transform:translate(-50%, -50%);">
    <div style="width:8px;height:8px;background:white;border-radius:50%;"></div>
  </div>`,
  iconSize: [0, 0],
});

export const SecuritySettings: React.FC = () => {
  const { user, profile } = useAuthStore();
  const { config, loading, isSaving, fetchConfig, updateConfig } =
    useSecurityStore();

  const isSuper = isSuperAdmin(user?.email);
  const isAdmin = isSuper;

  // Local draft state
  const [form, setForm] = useState<SecurityAccessConfig>(DEFAULT_SECURITY_CONFIG);
  const [isDirty, setIsDirty] = useState(false);
  const [isAcquiringGps, setIsAcquiringGps] = useState(false);

  // Network & Live Location Diagnostics
  const [networkInfo, setNetworkInfo] = useState<{
    connected: boolean;
    connectionType: string;
    isWifi: boolean;
    ssid?: string;
  }>({
    connected: true,
    connectionType: 'unknown',
    isWifi: true,
  });

  const [testingLocation, setTestingLocation] = useState(false);
  const [deviceCoords, setDeviceCoords] = useState<{
    lat: number;
    lng: number;
    accuracy?: number;
    distance?: number;
    withinGeofence?: boolean;
  } | null>(null);

  // New Trusted Wi-Fi Network Modal / Input State
  const [showAddNetwork, setShowAddNetwork] = useState(false);
  const [newSsid, setNewSsid] = useState('');
  const [newSubnet, setNewSubnet] = useState('');
  const [newNotes, setNewNotes] = useState('');

  // Leaflet Map Refs
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const gymMarkerRef = useRef<L.Marker | null>(null);
  const deviceMarkerRef = useRef<L.Marker | null>(null);
  const geofenceCircleRef = useRef<L.Circle | null>(null);

  // Initialize and sync config
  useEffect(() => {
    fetchConfig();
  }, [fetchConfig]);

  useEffect(() => {
    if (config) {
      setForm(config);
      setIsDirty(false);
    }
  }, [config]);

  // Check current network status on load
  useEffect(() => {
    const checkNet = async () => {
      const net = await getDeviceNetworkStatus();
      setNetworkInfo(net);
    };
    checkNet();
    window.addEventListener('online', checkNet);
    window.addEventListener('offline', checkNet);
    return () => {
      window.removeEventListener('online', checkNet);
      window.removeEventListener('offline', checkNet);
    };
  }, []);

  // Sync Dirty State to parent Settings.tsx floating action bar
  useEffect(() => {
    window.dispatchEvent(
      new CustomEvent('settings-dirty-state', {
        detail: { isDirty, isSaving },
      })
    );
  }, [isDirty, isSaving]);

  // Listen for parent Settings.tsx trigger save/cancel events
  useEffect(() => {
    const handleTriggerSave = () => {
      if (isDirty && isAdmin) {
        handleSaveConfig();
      }
    };
    const handleTriggerCancel = () => {
      setForm(config);
      setIsDirty(false);
    };

    window.addEventListener('trigger-rates-save', handleTriggerSave);
    window.addEventListener('trigger-rates-cancel', handleTriggerCancel);
    return () => {
      window.removeEventListener('trigger-rates-save', handleTriggerSave);
      window.removeEventListener('trigger-rates-cancel', handleTriggerCancel);
    };
  }, [isDirty, form, config, isAdmin]);

  // Initialize Leaflet Map
  useEffect(() => {
    if (!mapContainerRef.current) return;

    if (!mapInstanceRef.current) {
      const initialLat = form.gym_latitude || 14.5995;
      const initialLng = form.gym_longitude || 120.9842;

      const map = L.map(mapContainerRef.current, {
        center: [initialLat, initialLng],
        zoom: 16,
        zoomControl: true,
      });

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution:
          '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
        maxZoom: 19,
      }).addTo(map);

      // Marker for Gym Facility
      const marker = L.marker([initialLat, initialLng], {
        icon: GYM_PIN_ICON,
        draggable: isAdmin,
      }).addTo(map);

      // Circle for Geofence
      const circle = L.circle([initialLat, initialLng], {
        radius: form.geofence_radius_meters || 150,
        color: '#bf0202',
        fillColor: '#bf0202',
        fillOpacity: 0.18,
        weight: 2,
      }).addTo(map);

      if (isAdmin) {
        marker.on('dragend', () => {
          const latLng = marker.getLatLng();
          circle.setLatLng(latLng);
          setForm((prev) => ({
            ...prev,
            gym_latitude: Number(latLng.lat.toFixed(6)),
            gym_longitude: Number(latLng.lng.toFixed(6)),
          }));
          setIsDirty(true);
        });

        map.on('click', (e: L.LeafletMouseEvent) => {
          marker.setLatLng(e.latlng);
          circle.setLatLng(e.latlng);
          setForm((prev) => ({
            ...prev,
            gym_latitude: Number(e.latlng.lat.toFixed(6)),
            gym_longitude: Number(e.latlng.lng.toFixed(6)),
          }));
          setIsDirty(true);
        });
      }

      mapInstanceRef.current = map;
      gymMarkerRef.current = marker;
      geofenceCircleRef.current = circle;
    }

    return () => {
      // Map cleanup on unmount
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
        gymMarkerRef.current = null;
        geofenceCircleRef.current = null;
        deviceMarkerRef.current = null;
      }
    };
  }, []);

  // Update map pin and circle whenever coordinates or radius change
  useEffect(() => {
    if (
      mapInstanceRef.current &&
      gymMarkerRef.current &&
      geofenceCircleRef.current
    ) {
      const lat = form.gym_latitude;
      const lng = form.gym_longitude;
      gymMarkerRef.current.setLatLng([lat, lng]);
      geofenceCircleRef.current.setLatLng([lat, lng]);
      geofenceCircleRef.current.setRadius(form.geofence_radius_meters);
    }
  }, [form.gym_latitude, form.gym_longitude, form.geofence_radius_meters]);

  // Handle saving the full security configuration
  const handleSaveConfig = async () => {
    if (!isAdmin) {
      toast.error('Only administrators can modify security policy.');
      return;
    }

    try {
      await updateConfig(form);
      setIsDirty(false);
      toast.success('Security & Access Control configuration saved!');
    } catch (err: any) {
      console.error('Error saving security policy:', err);
      toast.error(err.message || 'Failed to save security settings.');
    }
  };

  // Locate Current Device via Geolocation
  const handleLocateCurrentDevice = async () => {
    setTestingLocation(true);
    try {
      const pos = await getCurrentDevicePosition();
      const dist = calculateDistanceMeters(
        pos.latitude,
        pos.longitude,
        form.gym_latitude,
        form.gym_longitude
      );
      const isInside = dist <= form.geofence_radius_meters;

      setDeviceCoords({
        lat: pos.latitude,
        lng: pos.longitude,
        accuracy: pos.accuracy,
        distance: dist,
        withinGeofence: isInside,
      });

      if (mapInstanceRef.current) {
        if (deviceMarkerRef.current) {
          deviceMarkerRef.current.setLatLng([pos.latitude, pos.longitude]);
        } else {
          deviceMarkerRef.current = L.marker([pos.latitude, pos.longitude], {
            icon: DEVICE_PIN_ICON,
          })
            .addTo(mapInstanceRef.current)
            .bindPopup('Current Terminal Location');
        }
        mapInstanceRef.current.setView([pos.latitude, pos.longitude], 17);
      }

      if (isInside) {
        toast.success(`Within geofence! Distance: ${dist}m (Max: ${form.geofence_radius_meters}m)`);
      } else {
        toast.warning(`Outside geofence! Distance: ${dist}m (Max: ${form.geofence_radius_meters}m)`);
      }
    } catch (err: any) {
      toast.error(
        err.message || 'Could not retrieve device location. Check permissions.'
      );
    } finally {
      setTestingLocation(false);
    }
  };

  // Set gym center to current GPS location
  const handleSetGymToCurrentLocation = async () => {
    if (!isAdmin) return;
    setIsAcquiringGps(true);
    try {
      const pos = await getCurrentDevicePosition();
      const newLat = Number(pos.latitude.toFixed(6));
      const newLng = Number(pos.longitude.toFixed(6));

      setForm((prev) => ({
        ...prev,
        gym_latitude: newLat,
        gym_longitude: newLng,
      }));
      setIsDirty(true);

      if (mapInstanceRef.current) {
        mapInstanceRef.current.setView([newLat, newLng], 17);
      }

      toast.success(
        `Facility coordinates updated to your current GPS position: ${newLat}, ${newLng} (±${Math.round(pos.accuracy || 0)}m)`
      );
    } catch (err: any) {
      toast.error('Location error: ' + (err.message || 'Permission denied'));
    } finally {
      setIsAcquiringGps(false);
    }
  };

  // Add Trusted Wi-Fi Network
  const handleAddNetwork = () => {
    if (!newSsid.trim()) {
      toast.warning('Network SSID is required.');
      return;
    }

    const networkItem: TrustedWifiNetwork = {
      id: crypto.randomUUID(),
      ssid: newSsid.trim(),
      subnet: newSubnet.trim() || undefined,
      notes: newNotes.trim() || undefined,
      added_at: new Date().toISOString(),
      added_by: user?.email || 'Admin',
    };

    setForm((prev) => ({
      ...prev,
      trusted_networks: [...prev.trusted_networks, networkItem],
    }));
    setIsDirty(true);
    setNewSsid('');
    setNewSubnet('');
    setNewNotes('');
    setShowAddNetwork(false);
    toast.success(`Network "${networkItem.ssid}" registered to trusted list.`);
  };

  // Quick Register Current Network
  const handleRegisterCurrentNetwork = () => {
    const detectedSsid = networkInfo.ssid || 'Palomar-Gym-WiFi';
    const exists = form.trusted_networks.some(
      (n) => n.ssid.toLowerCase() === detectedSsid.toLowerCase()
    );

    if (exists) {
      toast.info(`"${detectedSsid}" is already in the trusted network list.`);
      return;
    }

    const networkItem: TrustedWifiNetwork = {
      id: crypto.randomUUID(),
      ssid: detectedSsid,
      notes: 'Auto-registered from current terminal',
      added_at: new Date().toISOString(),
      added_by: user?.email || 'Admin',
    };

    setForm((prev) => ({
      ...prev,
      trusted_networks: [...prev.trusted_networks, networkItem],
    }));
    setIsDirty(true);
    toast.success(`Registered current network "${detectedSsid}".`);
  };

  // Delete Trusted Wi-Fi Network
  const handleDeleteNetwork = (id: string) => {
    setForm((prev) => ({
      ...prev,
      trusted_networks: prev.trusted_networks.filter((n) => n.id !== id),
    }));
    setIsDirty(true);
    toast.info('Network removed from trusted list.');
  };

  if (!isSuper) {
    return (
      <div className="w-full flex justify-center py-6">
        <div className="w-full max-w-lg p-8 text-center bg-white dark:bg-zinc-900 rounded-2xl border border-slate-200 dark:border-zinc-800 space-y-3 shadow-xs">
          <div className="w-12 h-12 rounded-2xl bg-red-500/10 dark:bg-red-950/40 border border-red-500/20 text-red-600 dark:text-red-400 flex items-center justify-center mx-auto">
            <ShieldAlert className="w-6 h-6" />
          </div>
          <h3 className="text-base font-heading font-black uppercase text-slate-900 dark:text-white">
            Super Admin Access Required
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed max-w-sm mx-auto">
            Facility Access & Security configuration (geofence perimeter, IP restrictions, and turnstile controls) is strictly reserved for Super Administrators.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full flex justify-center py-2">
      <div className="w-full max-w-4xl space-y-6">
        {/* Header Bar */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-5 border-b border-slate-200 dark:border-zinc-800">
          <div>
            <h2 className="text-xl font-heading font-black uppercase tracking-tight text-slate-900 dark:text-white flex items-center gap-2.5">
              <ShieldAlert className="w-6 h-6 text-red-600 dark:text-red-500" />
              Facility Security & Access Controls
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 font-medium">
              Configure perimeter geofencing and physical Wi-Fi restrictions to
              protect staff terminals and administrative consoles.
            </p>
          </div>

          <div className="flex items-center gap-2.5 shrink-0">
            {isAdmin && isDirty && (
              <button
                type="button"
                onClick={handleSaveConfig}
                disabled={isSaving}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-heading font-black uppercase tracking-wider bg-blue-600 dark:bg-red-600 hover:bg-blue-700 dark:hover:bg-red-700 text-white transition-all shadow-md active:scale-95 cursor-pointer"
              >
                {isSaving ? (
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Save className="w-3.5 h-3.5" />
                )}
                <span>Save Changes</span>
              </button>
            )}

            <button
              type="button"
              onClick={() => fetchConfig()}
              disabled={loading}
              className="inline-flex items-center justify-center gap-2 px-3.5 py-2 rounded-xl text-xs font-heading font-black uppercase tracking-wider bg-slate-100 dark:bg-zinc-800 hover:bg-slate-200 dark:hover:bg-zinc-700 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-zinc-700 transition-colors cursor-pointer shadow-xs"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              <span>Refresh</span>
            </button>
          </div>
        </div>

        {/* Info Banner for Public Registration Exemption */}
        <div className="p-4 rounded-2xl bg-blue-500/5 dark:bg-blue-950/20 border border-blue-500/20 text-xs text-slate-700 dark:text-slate-300 flex items-start gap-3">
          <Info className="w-5 h-5 text-blue-600 dark:text-blue-400 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <p className="font-heading font-bold uppercase text-slate-900 dark:text-white">
              Public Pre-Registration Route Protection Note
            </p>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed font-medium">
              Geofence and Wi-Fi restrictions strictly guard internal staff and
              administrative consoles (POS, Attendance Logbook, Members, and Cash
              Management). Public member pre-registration at{' '}
              <code className="px-1.5 py-0.5 rounded bg-blue-500/10 font-mono text-blue-600 dark:text-blue-400">
                /register
              </code>{' '}
              remains freely accessible to visitors worldwide.
            </p>
          </div>
        </div>

        {/* SECTION 1: LOCATION-BASED GEOFENCE CONTROL */}
        <div className="p-5 sm:p-6 rounded-2xl bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 shadow-xs space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3.5">
              <div className="w-10 h-10 rounded-xl bg-red-500/10 dark:bg-red-950/50 border border-red-500/20 text-red-600 dark:text-red-400 flex items-center justify-center">
                <MapPin className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-heading font-bold text-slate-900 dark:text-white uppercase tracking-wide">
                  Perimeter Geofence Access Control
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Restricts terminal operation to physical gym premises based on
                  device GPS location.
                </p>
              </div>
            </div>

            {/* Toggle Switch */}
            <label className="relative inline-flex items-center cursor-pointer shrink-0">
              <input
                type="checkbox"
                disabled={!isAdmin}
                checked={form.location_restriction_enabled}
                onChange={(e) => {
                  setForm((prev) => ({
                    ...prev,
                    location_restriction_enabled: e.target.checked,
                  }));
                  setIsDirty(true);
                }}
                className="sr-only peer"
              />
              <div className="w-12 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer dark:bg-zinc-800 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-zinc-700 peer-checked:bg-red-600"></div>
              <span className="ml-3 text-xs font-heading font-black tracking-wider uppercase text-slate-700 dark:text-slate-300">
                {form.location_restriction_enabled ? 'Enforced' : 'Disabled'}
              </span>
            </label>
          </div>

          {/* MAP DISPLAY */}
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
              <span className="text-slate-600 dark:text-slate-400 font-medium">
                {isAdmin
                  ? 'Drag the red pin or click anywhere on the map to set the gym facility centerpoint.'
                  : 'Gym facility location perimeter map.'}
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleLocateCurrentDevice}
                  disabled={testingLocation}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-slate-800 dark:text-slate-200 font-heading font-bold text-[11px] uppercase tracking-wider transition-colors cursor-pointer"
                >
                  <LocateFixed className={`w-3.5 h-3.5 ${testingLocation ? 'animate-spin' : ''}`} />
                  <span>Test Device Location</span>
                </button>

                {isAdmin && (
                  <button
                    type="button"
                    onClick={handleSetGymToCurrentLocation}
                    disabled={isAcquiringGps}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-red-600 hover:bg-red-700 text-white font-heading font-bold text-[11px] uppercase tracking-wider transition-colors cursor-pointer shadow-xs disabled:opacity-50"
                  >
                    <Navigation className={`w-3.5 h-3.5 ${isAcquiringGps ? 'animate-spin' : ''}`} />
                    <span>{isAcquiringGps ? 'Acquiring GPS...' : 'Set Center to My GPS Location'}</span>
                  </button>
                )}
              </div>
            </div>

            {/* Leaflet Map Canvas */}
            <div
              ref={mapContainerRef}
              className="w-full h-72 sm:h-80 rounded-2xl overflow-hidden border border-slate-200 dark:border-zinc-800 shadow-inner z-0"
              style={{ minHeight: '280px' }}
            />

            {/* Quick GPS Geofence Setter Banner */}
            {isAdmin && (
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 bg-red-500/5 dark:bg-red-950/20 border border-red-500/20 rounded-2xl">
                <div className="flex items-center gap-2.5 text-xs text-slate-700 dark:text-slate-300">
                  <Crosshair className="w-4 h-4 text-red-600 dark:text-red-400 shrink-0" />
                  <div>
                    <span className="font-heading font-bold text-slate-900 dark:text-white uppercase tracking-wider block">
                      Auto-Detect Facility Center via GPS
                    </span>
                    <span className="text-[11px] text-slate-500 dark:text-slate-400">
                      Sync facility latitude & longitude directly to your current device location.
                    </span>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleSetGymToCurrentLocation}
                  disabled={isAcquiringGps}
                  className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-xl bg-red-600 hover:bg-red-700 text-white text-[11px] font-heading font-black uppercase tracking-wider transition-all cursor-pointer shadow-xs shrink-0 active:scale-95 disabled:opacity-50"
                >
                  <Navigation className={`w-3.5 h-3.5 ${isAcquiringGps ? 'animate-spin' : ''}`} />
                  <span>{isAcquiringGps ? 'Acquiring GPS...' : 'Set to My Current Location'}</span>
                </button>
              </div>
            )}

            {/* Location Diagnostics Banner */}
            {deviceCoords && (
              <div
                className={`p-3.5 rounded-xl border flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs ${
                  deviceCoords.withinGeofence
                    ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-700 dark:text-emerald-300'
                    : 'bg-rose-500/10 border-rose-500/20 text-rose-700 dark:text-rose-300'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  {deviceCoords.withinGeofence ? (
                    <CheckCircle2 className="w-5 h-5 shrink-0 text-emerald-500" />
                  ) : (
                    <AlertTriangle className="w-5 h-5 shrink-0 text-rose-500" />
                  )}
                  <div>
                    <span className="font-heading font-bold uppercase tracking-wider">
                      {deviceCoords.withinGeofence
                        ? 'Device is within authorized geofence'
                        : 'Device is outside permitted perimeter'}
                    </span>
                    <p className="text-[11px] opacity-90 mt-0.5">
                      Distance to Gym: <strong>{deviceCoords.distance}m</strong> (Allowed Radius: {form.geofence_radius_meters}m). GPS Accuracy: ±{Math.round(deviceCoords.accuracy || 0)}m.
                    </p>
                  </div>
                </div>

                <span className="px-2.5 py-1 rounded-full text-[10px] font-heading font-black tracking-widest uppercase self-start sm:self-center border bg-white dark:bg-zinc-950">
                  {deviceCoords.withinGeofence ? 'Access Allowed' : 'Access Restricted'}
                </span>
              </div>
            )}

            {/* Geofence Parameters */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2">
              <div>
                <label className="block text-xs font-heading font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400 mb-1.5">
                  Facility Latitude
                </label>
                <input
                  type="number"
                  step="0.000001"
                  disabled={!isAdmin}
                  value={form.gym_latitude}
                  onChange={(e) => {
                    setForm((prev) => ({
                      ...prev,
                      gym_latitude: parseFloat(e.target.value) || 0,
                    }));
                    setIsDirty(true);
                  }}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-zinc-950 border border-slate-200 dark:border-zinc-800 rounded-xl text-xs font-mono font-semibold text-slate-800 dark:text-slate-200 outline-none focus:ring-2 focus:ring-red-500/30"
                />
              </div>

              <div>
                <label className="block text-xs font-heading font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400 mb-1.5">
                  Facility Longitude
                </label>
                <input
                  type="number"
                  step="0.000001"
                  disabled={!isAdmin}
                  value={form.gym_longitude}
                  onChange={(e) => {
                    setForm((prev) => ({
                      ...prev,
                      gym_longitude: parseFloat(e.target.value) || 0,
                    }));
                    setIsDirty(true);
                  }}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-zinc-950 border border-slate-200 dark:border-zinc-800 rounded-xl text-xs font-mono font-semibold text-slate-800 dark:text-slate-200 outline-none focus:ring-2 focus:ring-red-500/30"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-heading font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400">
                    Geofence Radius (Meters)
                  </label>
                  <span className="text-xs font-mono font-bold text-red-600 dark:text-red-400">
                    {form.geofence_radius_meters}m
                  </span>
                </div>
                <input
                  type="range"
                  min="30"
                  max="1000"
                  step="10"
                  disabled={!isAdmin}
                  value={form.geofence_radius_meters}
                  onChange={(e) => {
                    setForm((prev) => ({
                      ...prev,
                      geofence_radius_meters: parseInt(e.target.value, 10) || 150,
                    }));
                    setIsDirty(true);
                  }}
                  className="w-full h-2 bg-slate-200 dark:bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-red-600"
                />
                <div className="flex justify-between text-[10px] text-slate-400 mt-1 font-mono">
                  <span>30m</span>
                  <span>250m</span>
                  <span>500m</span>
                  <span>1000m</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* SECTION 2: PHYSICAL WI-FI ACCESS CONTROL */}
        <div className="p-5 sm:p-6 rounded-2xl bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 shadow-xs space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3.5">
              <div className="w-10 h-10 rounded-xl bg-blue-500/10 dark:bg-blue-950/50 border border-blue-500/20 text-blue-600 dark:text-blue-400 flex items-center justify-center">
                <Wifi className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-heading font-bold text-slate-900 dark:text-white uppercase tracking-wide">
                  Physical Wi-Fi Network Access Control
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Restricts access to hardware connected to verified local Wi-Fi
                  networks.
                </p>
              </div>
            </div>

            {/* Toggle Switch */}
            <label className="relative inline-flex items-center cursor-pointer shrink-0">
              <input
                type="checkbox"
                disabled={!isAdmin}
                checked={form.wifi_restriction_enabled}
                onChange={(e) => {
                  setForm((prev) => ({
                    ...prev,
                    wifi_restriction_enabled: e.target.checked,
                  }));
                  setIsDirty(true);
                }}
                className="sr-only peer"
              />
              <div className="w-12 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer dark:bg-zinc-800 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-zinc-700 peer-checked:bg-blue-600"></div>
              <span className="ml-3 text-xs font-heading font-black tracking-wider uppercase text-slate-700 dark:text-slate-300">
                {form.wifi_restriction_enabled ? 'Enforced' : 'Disabled'}
              </span>
            </label>
          </div>

          {/* Current Network Status Card */}
          <div className="p-4 rounded-xl bg-slate-50 dark:bg-zinc-950 border border-slate-200 dark:border-zinc-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div
                className={`p-2 rounded-lg ${
                  networkInfo.isWifi
                    ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                    : 'bg-amber-500/10 text-amber-600 dark:text-amber-400'
                }`}
              >
                <Radio className="w-5 h-5" />
              </div>
              <div>
                <span className="text-xs font-heading font-bold uppercase tracking-wider text-slate-800 dark:text-slate-200">
                  Current Connection:{' '}
                  <span className="text-blue-600 dark:text-blue-400 font-mono">
                    {networkInfo.connectionType.toUpperCase()}
                  </span>
                </span>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                  {networkInfo.isWifi
                    ? 'Terminal is connected via local Wi-Fi network.'
                    : 'Terminal connection is mobile cellular or non-Wi-Fi interface.'}
                </p>
              </div>
            </div>

            {isAdmin && (
              <button
                type="button"
                onClick={handleRegisterCurrentNetwork}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-blue-500/10 hover:bg-blue-500/20 text-blue-600 dark:text-blue-400 border border-blue-500/20 text-xs font-heading font-bold uppercase tracking-wider cursor-pointer self-start sm:self-center"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Register Current Network</span>
              </button>
            )}
          </div>

          {/* Strict Wi-Fi Matching Option */}
          <div className="flex items-center justify-between p-3.5 rounded-xl bg-slate-50 dark:bg-zinc-950 border border-slate-200 dark:border-zinc-800">
            <div className="space-y-0.5">
              <span className="text-xs font-heading font-bold uppercase tracking-wider text-slate-800 dark:text-slate-200">
                Require Registered Trusted Network Match
              </span>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                When enabled, devices must connect to one of the authorized
                network SSIDs listed below.
              </p>
            </div>

            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                disabled={!isAdmin}
                checked={form.require_trusted_network}
                onChange={(e) => {
                  setForm((prev) => ({
                    ...prev,
                    require_trusted_network: e.target.checked,
                  }));
                  setIsDirty(true);
                }}
                className="sr-only peer"
              />
              <div className="w-10 h-5 bg-slate-200 peer-focus:outline-none rounded-full peer dark:bg-zinc-800 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all dark:border-zinc-700 peer-checked:bg-blue-600"></div>
            </label>
          </div>

          {/* Trusted Wi-Fi Networks List */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-heading font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 flex items-center gap-2">
                <Server className="w-4 h-4 text-blue-500" />
                Authorized Gym Wi-Fi Networks ({form.trusted_networks.length})
              </h4>

              {isAdmin && !showAddNetwork && (
                <button
                  type="button"
                  onClick={() => setShowAddNetwork(true)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-slate-800 dark:text-white text-xs font-heading font-bold uppercase tracking-wider cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Add Network</span>
                </button>
              )}
            </div>

            {/* Add Network Inline Form */}
            {showAddNetwork && isAdmin && (
              <div className="p-4 rounded-xl bg-slate-100 dark:bg-zinc-950 border border-blue-500/30 space-y-3">
                <h5 className="text-xs font-heading font-bold uppercase tracking-wider text-blue-600 dark:text-blue-400">
                  Register New Authorized Network
                </h5>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-[11px] font-heading font-bold uppercase text-slate-500 dark:text-slate-400 mb-1">
                      Network Name (SSID) *
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. Palomar_Staff_5G"
                      value={newSsid}
                      onChange={(e) => setNewSsid(e.target.value)}
                      className="w-full px-3 py-1.5 bg-white dark:bg-zinc-900 border border-slate-300 dark:border-zinc-700 rounded-lg text-xs font-semibold text-slate-800 dark:text-slate-200 outline-none focus:ring-2 focus:ring-blue-500/30"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-heading font-bold uppercase text-slate-500 dark:text-slate-400 mb-1">
                      Subnet / Gateway (Optional)
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. 192.168.1.*"
                      value={newSubnet}
                      onChange={(e) => setNewSubnet(e.target.value)}
                      className="w-full px-3 py-1.5 bg-white dark:bg-zinc-900 border border-slate-300 dark:border-zinc-700 rounded-lg text-xs font-semibold text-slate-800 dark:text-slate-200 outline-none focus:ring-2 focus:ring-blue-500/30"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-heading font-bold uppercase text-slate-500 dark:text-slate-400 mb-1">
                      Location / Notes
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. Front Desk Access Point"
                      value={newNotes}
                      onChange={(e) => setNewNotes(e.target.value)}
                      className="w-full px-3 py-1.5 bg-white dark:bg-zinc-900 border border-slate-300 dark:border-zinc-700 rounded-lg text-xs font-semibold text-slate-800 dark:text-slate-200 outline-none focus:ring-2 focus:ring-blue-500/30"
                    />
                  </div>
                </div>

                <div className="flex items-center justify-end gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => setShowAddNetwork(false)}
                    className="px-3 py-1.5 rounded-lg text-xs font-heading font-bold uppercase text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-zinc-800 cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleAddNetwork}
                    className="px-4 py-1.5 rounded-lg text-xs font-heading font-black uppercase tracking-wider bg-blue-600 hover:bg-blue-700 text-white cursor-pointer shadow-xs"
                  >
                    Confirm Add
                  </button>
                </div>
              </div>
            )}

            {/* List of networks */}
            {form.trusted_networks.length === 0 ? (
              <div className="p-6 rounded-xl border border-dashed border-slate-200 dark:border-zinc-800 text-center text-xs text-slate-400">
                No trusted Wi-Fi networks registered yet. Any detected local Wi-Fi
                connection will be accepted until specific networks are added.
              </div>
            ) : (
              <div className="divide-y divide-slate-100 dark:divide-zinc-800 rounded-xl border border-slate-200 dark:border-zinc-800 overflow-hidden bg-white dark:bg-zinc-950">
                {form.trusted_networks.map((net) => (
                  <div
                    key={net.id}
                    className="p-3.5 flex items-center justify-between gap-3 text-xs"
                  >
                    <div className="flex items-center gap-3">
                      <div className="p-2 rounded-lg bg-blue-500/10 text-blue-600 dark:text-blue-400">
                        <Wifi className="w-4 h-4" />
                      </div>
                      <div>
                        <div className="font-heading font-bold text-slate-900 dark:text-white uppercase tracking-wider">
                          {net.ssid}
                        </div>
                        <div className="text-[11px] text-slate-500 dark:text-slate-400 flex items-center gap-2 mt-0.5">
                          {net.notes && <span>{net.notes}</span>}
                          {net.subnet && (
                            <span className="font-mono px-1.5 py-0.5 rounded bg-slate-100 dark:bg-zinc-800">
                              {net.subnet}
                            </span>
                          )}
                          <span>• Added by {net.added_by || 'Admin'}</span>
                        </div>
                      </div>
                    </div>

                    {isAdmin && (
                      <button
                        type="button"
                        onClick={() => handleDeleteNetwork(net.id)}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-500/10 transition-colors cursor-pointer"
                        title="Remove network"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* SECTION 3: ROLE ENFORCEMENT & OVERRIDE CONTROLS */}
        <div className="p-5 sm:p-6 rounded-2xl bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 shadow-xs space-y-4">
          <h3 className="text-sm font-heading font-bold text-slate-900 dark:text-white uppercase tracking-wide flex items-center gap-2">
            <Sliders className="w-4 h-4 text-purple-600 dark:text-purple-400" />
            Enforcement Scope & Emergency Bypass
          </h3>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Superadmin Remote Access Toggle */}
            <div className="p-4 rounded-xl bg-slate-50 dark:bg-zinc-950 border border-slate-200 dark:border-zinc-800 flex items-center justify-between gap-3">
              <div>
                <span className="text-xs font-heading font-bold uppercase tracking-wider text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                  <ShieldCheck className="w-4 h-4 text-purple-500" />
                  Superadmin Remote Bypass
                </span>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                  Allows the authoritative Superadmin to manage the console
                  remotely during emergencies or off-site maintenance.
                </p>
              </div>

              <label className="relative inline-flex items-center cursor-pointer shrink-0">
                <input
                  type="checkbox"
                  disabled={!isAdmin}
                  checked={form.bypass_superadmin}
                  onChange={(e) => {
                    setForm((prev) => ({
                      ...prev,
                      bypass_superadmin: e.target.checked,
                    }));
                    setIsDirty(true);
                  }}
                  className="sr-only peer"
                />
                <div className="w-10 h-5 bg-slate-200 peer-focus:outline-none rounded-full peer dark:bg-zinc-800 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all dark:border-zinc-700 peer-checked:bg-purple-600"></div>
              </label>
            </div>

            {/* Role Enforcement Scope */}
            <div className="p-4 rounded-xl bg-slate-50 dark:bg-zinc-950 border border-slate-200 dark:border-zinc-800 flex items-center justify-between gap-3">
              <div>
                <span className="text-xs font-heading font-bold uppercase tracking-wider text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                  <Lock className="w-4 h-4 text-amber-500" />
                  Enforce on Administrators
                </span>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                  When enabled, standard administrator accounts are subject to
                  the same geofence and Wi-Fi restrictions as staff.
                </p>
              </div>

              <label className="relative inline-flex items-center cursor-pointer shrink-0">
                <input
                  type="checkbox"
                  disabled={!isAdmin}
                  checked={form.enforce_on_roles.includes('admin')}
                  onChange={(e) => {
                    const nextRoles = e.target.checked
                      ? ['staff', 'admin'] as ('staff' | 'admin')[]
                      : ['staff'] as ('staff' | 'admin')[];
                    setForm((prev) => ({
                      ...prev,
                      enforce_on_roles: nextRoles,
                    }));
                    setIsDirty(true);
                  }}
                  className="sr-only peer"
                />
                <div className="w-10 h-5 bg-slate-200 peer-focus:outline-none rounded-full peer dark:bg-zinc-800 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all dark:border-zinc-700 peer-checked:bg-amber-600"></div>
              </label>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
