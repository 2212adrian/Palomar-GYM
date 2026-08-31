// src/components/ui/MemberAvatar.tsx

import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  Camera,
  Upload,
  RefreshCw,
  Check,
  SwitchCamera,
  User,
  Sparkles,
  Trash2,
  AlertCircle,
} from 'lucide-react';
import { Modal } from '../../../components/ui/Modal';
import { supabase } from '../../../lib/supabase/client';
import {
  MEMBER_AVATARS_BUCKET,
  compressImageTo1024,
  uploadMemberAvatar,
  deleteMemberAvatarFromBucket,
  type CompressResult,
} from '../../../lib/supabase/memberStorage';
import { toast } from 'react-toastify';

/* -------------------------------------------------------------------------- */
/*                                   TYPES                                    */
/* -------------------------------------------------------------------------- */

export interface MemberAvatarProps {
  src?: string | null;
  name?: string;
  className?: string;
  size?: number; // default 40
  roundedClassName?: string;
  isEditable?: boolean;
  onEditClick?: () => void;
  badgeTooltip?: string;
}

export interface MemberPhotoModalProps {
  isOpen: boolean;
  onClose: () => void;
  memberName: string;
  memberId: string;
  currentImageUrl?: string | null;
  onSaveSuccess: (newUrl: string) => Promise<void> | void;
  onDeleteSuccess?: () => Promise<void> | void;
}

export type MemberAvatarUploadModalProps = MemberPhotoModalProps;

type ModalMode = 'view' | 'camera' | 'preview';

/* -------------------------------------------------------------------------- */
/*                                   HELPERS                                  */
/* -------------------------------------------------------------------------- */

const getFriendlyCameraErrorMessage = (err: any): string => {
  const msg = typeof err === 'string' ? err : err?.message || String(err || '');
  const lower = msg.toLowerCase();
  if (lower.includes('notallowederror') || lower.includes('permission')) {
    return 'Camera access was denied. Please allow camera permission in your browser.';
  }
  if (lower.includes('notreadableerror') || lower.includes('in use')) {
    return 'Your camera is currently busy or being used by another application.';
  }
  if (lower.includes('notfounderror')) {
    return 'No camera device found on this system.';
  }
  return 'Could not start camera. You can still upload a photo from your files.';
};

/* -------------------------------------------------------------------------- */
/*                            MEMBER AVATAR DISPLAY                           */
/* -------------------------------------------------------------------------- */

export const MemberAvatar: React.FC<MemberAvatarProps> = ({
  src,
  name = 'Member',
  className = '',
  size = 40,
  roundedClassName = 'rounded-xl',
  isEditable = false,
  onEditClick,
  badgeTooltip = 'Click to change photo (Take selfie / upload)',
}) => {
  const [resolvedUrl, setResolvedUrl] = useState<string | null>(null);
  const [hasError, setHasError] = useState<boolean>(false);

  useEffect(() => {
    setHasError(false);
    if (!src || !src.trim()) {
      setResolvedUrl(null);
      return;
    }

    const trimmed = src.trim();

    // Direct HTTP(S), Blob, or base64 Data URLs
    if (
      trimmed.startsWith('http://') ||
      trimmed.startsWith('https://') ||
      trimmed.startsWith('blob:') ||
      trimmed.startsWith('data:')
    ) {
      setResolvedUrl(trimmed);
      return;
    }

    // Relative storage bucket path resolution
    const resolveStoragePath = async () => {
      const cleanPath = trimmed.startsWith('/') ? trimmed.slice(1) : trimmed;
      try {
        const { data: pubData } = supabase.storage
          .from(MEMBER_AVATARS_BUCKET)
          .getPublicUrl(cleanPath);

        if (pubData?.publicUrl) {
          setResolvedUrl(pubData.publicUrl);
        } else {
          const { data: fallbackPub } = supabase.storage
            .from('avatars')
            .getPublicUrl(cleanPath);
          setResolvedUrl(fallbackPub?.publicUrl || null);
        }
      } catch {
        setHasError(true);
      }
    };

    resolveStoragePath();
  }, [src]);

  const initial = (name || 'M').trim().charAt(0).toUpperCase() || 'M';

  const sizeStyle = size
    ? { width: `${size}px`, height: `${size}px`, minWidth: `${size}px`, minHeight: `${size}px` }
    : undefined;

  return (
    <div
      style={sizeStyle}
      onClick={(e) => {
        if (isEditable && onEditClick) {
          e.stopPropagation();
          onEditClick();
        }
      }}
      className={`relative group shrink-0 select-none overflow-hidden ${roundedClassName} ${
        isEditable ? 'cursor-pointer' : ''
      } ${className}`}
      title={isEditable ? badgeTooltip : name}
    >
      {resolvedUrl && !hasError ? (
        <img
          src={resolvedUrl}
          alt={name}
          onError={() => setHasError(true)}
          className={`w-full h-full object-cover border border-(--border-color) ${roundedClassName} transition-transform duration-200 group-hover:scale-105`}
          referrerPolicy="no-referrer"
          loading="lazy"
        />
      ) : (
        <div
          className={`w-full h-full bg-[#123c73] dark:bg-[#bf0202] text-white flex items-center justify-center font-heading font-black shadow-inner border border-white/20 ${roundedClassName}`}
          style={{ fontSize: `${Math.max(12, Math.round(size * 0.42))}px` }}
        >
          {initial}
        </div>
      )}

      {/* Interactive Hover / Edit Overlay Badge */}
      {isEditable && (
        <div
          className={`absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center text-white ${roundedClassName} backdrop-blur-xs`}
        >
          <Camera className="w-5 h-5 text-white animate-pulse" />
          <span className="text-[8px] font-heading font-extrabold uppercase tracking-wider mt-0.5 text-white">
            Photo
          </span>
        </div>
      )}
    </div>
  );
};

/* -------------------------------------------------------------------------- */
/*                       MEMBER PHOTO MODAL / UPLOAD                          */
/* -------------------------------------------------------------------------- */

export const MemberPhotoModal: React.FC<MemberPhotoModalProps> = ({
  isOpen,
  onClose,
  memberName,
  memberId,
  currentImageUrl,
  onSaveSuccess,
  onDeleteSuccess,
}) => {
  const [mode, setMode] = useState<ModalMode>('view');
  const [cameras, setCameras] = useState<MediaDeviceInfo[]>([]);
  const [selectedCameraIndex, setSelectedCameraIndex] = useState<number>(0);
  const [cameraError, setCameraError] = useState<string | null>(null);

  const [previewResult, setPreviewResult] = useState<CompressResult | null>(null);
  const [isCapturing, setIsCapturing] = useState<boolean>(false);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [isDeleting, setIsDeleting] = useState<boolean>(false);
  const [confirmDelete, setConfirmDelete] = useState<boolean>(false);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const stopCameraStream = useCallback(() => {
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
  }, []);

  const detectCameras = useCallback(async () => {
    try {
      if (!navigator.mediaDevices?.enumerateDevices) return;
      const devices = await navigator.mediaDevices.enumerateDevices();
      const videoDevices = devices.filter((d) => d.kind === 'videoinput');
      setCameras(videoDevices);
    } catch (e) {
      console.warn('Could not enumerate cameras:', e);
    }
  }, []);

  const startCameraStream = useCallback(async (deviceId?: string) => {
    stopCameraStream();
    setCameraError(null);

    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('Camera device access is not supported on this browser.');
      }

      const constraints: MediaStreamConstraints = {
        video: deviceId
          ? { deviceId: { exact: deviceId }, width: { ideal: 1024 }, height: { ideal: 1024 } }
          : { facingMode: 'user', width: { ideal: 1024 }, height: { ideal: 1024 } },
        audio: false,
      };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      streamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.onloadedmetadata = () => {
          videoRef.current?.play().catch(() => {});
        };
      }

      await detectCameras();
    } catch (err: any) {
      setCameraError(getFriendlyCameraErrorMessage(err));
    }
  }, [stopCameraStream, detectCameras]);

  useEffect(() => {
    if (isOpen) {
      setMode('view');
      setPreviewResult(null);
      setCameraError(null);
      setConfirmDelete(false);
    } else {
      stopCameraStream();
    }
  }, [isOpen, stopCameraStream]);

  useEffect(() => {
    if (isOpen && mode === 'camera') {
      const activeDeviceId = cameras[selectedCameraIndex]?.deviceId;
      startCameraStream(activeDeviceId);
    } else {
      stopCameraStream();
    }
    return () => {
      stopCameraStream();
    };
  }, [isOpen, mode, selectedCameraIndex, startCameraStream, stopCameraStream]);

  const handleCycleCamera = () => {
    if (cameras.length <= 1) return;
    const nextIndex = (selectedCameraIndex + 1) % cameras.length;
    setSelectedCameraIndex(nextIndex);
  };

  const handleSnapPhoto = async () => {
    if (!videoRef.current || isCapturing) return;
    setIsCapturing(true);

    try {
      const video = videoRef.current;
      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth || 1024;
      canvas.height = video.videoHeight || 1024;

      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Could not process photo');

      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

      const result = await compressImageTo1024(canvas, 1024, 0.85);
      setPreviewResult(result);
      setMode('preview');
      stopCameraStream();
    } catch (err: any) {
      toast.error('Failed to take photo: ' + err.message);
    } finally {
      setIsCapturing(false);
    }
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      toast.warning('Please choose a valid image file (JPG, PNG, WebP).');
      return;
    }

    try {
      const result = await compressImageTo1024(file, 1024, 0.85);
      setPreviewResult(result);
      setMode('preview');
      stopCameraStream();
    } catch (err: any) {
      toast.error('Could not process image: ' + err.message);
    } finally {
      e.target.value = '';
    }
  };

  const handleSavePhoto = async () => {
    if (!previewResult) return;
    setIsSaving(true);

    try {
      await deleteMemberAvatarFromBucket(memberId, currentImageUrl);
      const publicUrl = await uploadMemberAvatar(memberId, previewResult.blob);

      await supabase
        .from('members')
        .update({ 
          avatar_url: publicUrl,
          image_url: publicUrl,
          updated_at: new Date().toISOString() 
        })
        .or(`member_id.eq.${memberId},id.eq.${memberId}`);

      await onSaveSuccess(publicUrl);
      toast.success('Member photo updated successfully.');
      setMode('view');
      onClose();
    } catch (err: any) {
      toast.error('Failed to save photo: ' + err.message);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeletePhoto = async () => {
    if (!currentImageUrl || isDeleting) return;
    setIsDeleting(true);

    try {
      await deleteMemberAvatarFromBucket(memberId, currentImageUrl);

      await supabase
        .from('members')
        .update({ 
          avatar_url: null,
          image_url: null,
          updated_at: new Date().toISOString() 
        })
        .or(`member_id.eq.${memberId},id.eq.${memberId}`);

      if (onDeleteSuccess) {
        await onDeleteSuccess();
      } else {
        await onSaveSuccess('');
      }

      toast.success('Photo removed successfully.');
      setConfirmDelete(false);
      setMode('camera');
    } catch (err: any) {
      console.error('Photo deletion error:', err);
      toast.error(err.message || 'Failed to delete photo.');
    } finally {
      setIsDeleting(false);
    }
  };

  const handleClose = () => {
    stopCameraStream();
    onClose();
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title={
        mode === 'view'
          ? 'MEMBER PHOTO'
          : mode === 'camera'
          ? 'TAKE MEMBER PHOTO'
          : 'PREVIEW PHOTO'
      }
    >
      <div className="space-y-3.5 text-left font-body">
        {/* Hidden File Input */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          onChange={handleFileSelect}
          className="hidden"
        />

        {/* Member Header Info */}
        <div className="flex items-center justify-between p-3 bg-(--bg-page) border border-(--border-color) rounded-2xl">
          <div>
            <h4 className="font-extrabold text-sm text-(--color-text) leading-tight">{memberName}</h4>
            <span className="text-xs text-slate-400 font-mono font-bold">{memberId}</span>
          </div>
          <span className="px-3 py-1 rounded-full text-xs font-heading font-extrabold uppercase bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20">
            Profile Photo
          </span>
        </div>

        {/* ─── MODE 1: VIEW ONLY ─── */}
        {mode === 'view' && (
          <div className="space-y-3 animate-fade-in text-center">
            <div className="relative w-48 h-48 sm:w-56 sm:h-56 mx-auto rounded-3xl overflow-hidden border-2 border-(--border-color) shadow-xl bg-black flex items-center justify-center">
              {currentImageUrl ? (
                <img
                  src={currentImageUrl}
                  alt={memberName}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full bg-[#123c73] dark:bg-[#bf0202] text-white flex flex-col items-center justify-center space-y-1.5">
                  <User className="w-14 h-14 text-white/60" />
                  <span className="text-[11px] font-bold uppercase tracking-wider text-white/80">
                    No Photo Uploaded
                  </span>
                </div>
              )}
            </div>

            {/* Action Buttons */}
            <div className="grid grid-cols-2 gap-2 pt-1">
              <button
                type="button"
                onClick={() => setMode('camera')}
                className="py-2.5 px-3 bg-[#123c73] hover:bg-[#0e2f5a] dark:bg-[#bf0202] dark:hover:bg-[#a10202] text-white rounded-xl font-heading text-xs font-extrabold uppercase tracking-wider cursor-pointer shadow-md flex items-center justify-center gap-1.5 transition-all active:scale-95"
              >
                <Camera className="w-4 h-4" />
                <span>Take Photo</span>
              </button>

              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="py-2.5 px-3 bg-slate-200 hover:bg-slate-300 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-slate-800 dark:text-zinc-100 rounded-xl font-heading text-xs font-extrabold uppercase tracking-wider cursor-pointer shadow-sm flex items-center justify-center gap-1.5 transition-all active:scale-95 border border-(--border-color)"
              >
                <Upload className="w-4 h-4 text-blue-500" />
                <span>Upload File</span>
              </button>
            </div>

            {/* Delete Photo Section */}
            {currentImageUrl && (
              <div className="pt-2 border-t border-(--border-color)">
                {!confirmDelete ? (
                  <button
                    type="button"
                    onClick={() => setConfirmDelete(true)}
                    className="w-full py-2 px-3 text-xs font-bold uppercase text-rose-500 hover:bg-rose-500/10 rounded-xl flex items-center justify-center gap-1.5 transition-colors cursor-pointer border border-rose-500/20"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Delete Photo</span>
                  </button>
                ) : (
                  <div className="p-2.5 bg-rose-500/10 border border-rose-500/30 rounded-xl space-y-2 text-center animate-fade-in">
                    <p className="text-[11px] font-bold text-rose-600 dark:text-rose-400 uppercase">
                      Do you want to delete this photo?
                    </p>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        disabled={isDeleting}
                        onClick={() => setConfirmDelete(false)}
                        className="flex-1 py-1.5 bg-slate-200 dark:bg-zinc-800 text-slate-700 dark:text-slate-300 rounded-lg text-xs font-bold uppercase cursor-pointer"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        disabled={isDeleting}
                        onClick={handleDeletePhoto}
                        className="flex-1 py-1.5 bg-rose-600 hover:bg-rose-500 text-white rounded-lg text-xs font-black uppercase cursor-pointer flex items-center justify-center gap-1"
                      >
                        {isDeleting ? (
                          <>
                            <RefreshCw className="w-3 h-3 animate-spin" />
                            <span>Deleting...</span>
                          </>
                        ) : (
                          <>
                            <Trash2 className="w-3 h-3" />
                            <span>Yes, Delete</span>
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* ─── MODE 2: LIVE CAMERA / SELFIE ─── */}
        {mode === 'camera' && (
          <div className="space-y-3 animate-fade-in">
            <div className="flex items-center justify-between">
              <button
                type="button"
                onClick={() => setMode('view')}
                className="text-xs text-slate-400 hover:text-(--color-text) font-bold uppercase"
              >
                ← Back to Photo
              </button>

              {cameras.length > 1 && (
                <button
                  type="button"
                  onClick={handleCycleCamera}
                  className="px-3 py-1.5 bg-zinc-900 text-blue-400 border border-zinc-700 rounded-xl text-xs font-bold uppercase tracking-wider flex items-center gap-1.5 cursor-pointer shadow-sm hover:bg-zinc-800"
                >
                  <SwitchCamera className="w-3.5 h-3.5" />
                  <span>Switch Camera</span>
                </button>
              )}
            </div>

            <div className="relative w-full aspect-square max-w-56 sm:max-w-64 mx-auto rounded-3xl overflow-hidden bg-black border-2 border-dashed border-blue-500 shadow-2xl flex items-center justify-center">
              {cameraError ? (
                <div className="p-4 text-center text-xs text-rose-300 space-y-2">
                  <AlertCircle className="w-6 h-6 text-rose-400 mx-auto" />
                  <p className="font-bold">{cameraError}</p>
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="px-4 py-2 bg-blue-600 text-white rounded-xl font-bold uppercase cursor-pointer"
                  >
                    Upload From Device
                  </button>
                </div>
              ) : (
                <>
                  <video
                    ref={videoRef}
                    autoPlay
                    playsInline
                    muted
                    className="w-full h-full object-cover"
                  />
                  <div className="absolute inset-0 border-4 border-white/20 rounded-3xl pointer-events-none" />
                </>
              )}
            </div>

            <p className="text-[11px] font-medium text-slate-400 text-center">
              Center face inside the guide and look directly at the camera
            </p>

            <div className="flex items-center gap-2 pt-1">
              <button
                type="button"
                onClick={handleSnapPhoto}
                disabled={isCapturing || !!cameraError}
                className="flex-1 py-2.5 px-5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl font-heading text-xs font-extrabold uppercase tracking-wider cursor-pointer shadow-md flex items-center justify-center gap-2 transition-all active:scale-95 disabled:opacity-50"
              >
                <Camera className="w-4 h-4" />
                <span>Snap Photo</span>
              </button>
            </div>
          </div>
        )}

        {/* ─── MODE 3: PREVIEW & CONFIRM ─── */}
        {mode === 'preview' && previewResult && (
          <div className="space-y-3 animate-fade-in text-center">
            <div className="relative w-48 h-48 sm:w-56 sm:h-56 mx-auto rounded-3xl overflow-hidden border-2 border-emerald-500 shadow-xl bg-black flex items-center justify-center">
              <img
                src={previewResult.dataUrl}
                alt="Captured Snapshot"
                className="w-full h-full object-cover"
              />
              <div className="absolute top-2 right-2 w-7 h-7 rounded-full bg-emerald-500 text-white flex items-center justify-center shadow-lg">
                <Check className="w-4 h-4" />
              </div>
            </div>

            <div className="flex items-center justify-center gap-1.5 text-xs font-bold text-emerald-600 dark:text-emerald-400">
              <Sparkles className="w-4 h-4" />
              <span>Photo ready to save (1024x1024 HD)</span>
            </div>

            <div className="flex items-center justify-between gap-2 pt-1">
              <button
                type="button"
                onClick={() => {
                  setPreviewResult(null);
                  setMode('camera');
                }}
                disabled={isSaving}
                className="flex-1 py-2.5 px-4 bg-slate-200 hover:bg-slate-300 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-slate-800 dark:text-zinc-200 rounded-xl font-heading text-xs font-extrabold uppercase tracking-wider cursor-pointer flex items-center justify-center gap-1.5 transition-all"
              >
                <RefreshCw className="w-4 h-4" />
                <span>Retake</span>
              </button>

              <button
                type="button"
                onClick={handleSavePhoto}
                disabled={isSaving}
                className="flex-1 py-2.5 px-5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl font-heading text-xs font-extrabold uppercase tracking-wider cursor-pointer shadow-md flex items-center justify-center gap-2 transition-all active:scale-95 disabled:opacity-50"
              >
                {isSaving ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>Saving...</span>
                  </>
                ) : (
                  <>
                    <Check className="w-4 h-4" />
                    <span>Save Photo</span>
                  </>
                )}
              </button>
            </div>
          </div>
        )}

        {/* Modal Footer */}
        <div className="pt-2 border-t border-(--border-color) flex justify-end">
          <button
            type="button"
            onClick={handleClose}
            className="px-4 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-slate-700 dark:text-slate-300 rounded-xl text-xs font-heading font-extrabold uppercase tracking-wider cursor-pointer border-none"
          >
            Close
          </button>
        </div>
      </div>
    </Modal>
  );
};

/* Backwards-compatibility alias */
export const MemberAvatarUploadModal = MemberPhotoModal;