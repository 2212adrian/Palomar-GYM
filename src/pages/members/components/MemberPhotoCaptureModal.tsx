// src/pages/members/components/MemberPhotoCaptureModal.tsx
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  X, Camera, Upload, RefreshCw, CheckCircle2, AlertCircle, 
  RotateCcw, SwitchCamera, Sparkles, Image as ImageIcon, Loader2
} from 'lucide-react';
import { toast } from 'react-toastify';
import { compressImageTo64KB, uploadMemberProfilePhoto, MAX_AVATAR_SIZE_BYTES } from '../../../lib/supabase/memberStorage';

interface MemberPhotoCaptureModalProps {
  isOpen: boolean;
  onClose: () => void;
  onPhotoSaved: (photoUrl: string) => void;
  memberName?: string;
  memberId?: string;
  currentPhotoUrl?: string | null;
}

export const MemberPhotoCaptureModal: React.FC<MemberPhotoCaptureModalProps> = ({
  isOpen,
  onClose,
  onPhotoSaved,
  memberName = 'Member',
  memberId = 'member',
  currentPhotoUrl = null,
}) => {
  const [activeTab, setActiveTab] = useState<'camera' | 'upload'>('camera');
  
  // Camera Stream States
  const [videoStream, setVideoStream] = useState<MediaStream | null>(null);
  const [cameras, setCameras] = useState<MediaDeviceInfo[]>([]);
  const [selectedCameraId, setSelectedCameraId] = useState<string>('');
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [isCameraStarting, setIsCameraStarting] = useState<boolean>(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  // Captured / Selected Image State
  const [previewDataUrl, setPreviewDataUrl] = useState<string | null>(null);
  const [compressedBlob, setCompressedBlob] = useState<Blob | null>(null);
  const [compressedSizeBytes, setCompressedSizeBytes] = useState<number>(0);
  const [originalSizeBytes, setOriginalSizeBytes] = useState<number>(0);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [isUploading, setIsUploading] = useState<boolean>(false);
  const [flashActive, setFlashActive] = useState<boolean>(false);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Stop camera media tracks cleanly
  const stopCamera = useCallback(() => {
    if (videoStream) {
      videoStream.getTracks().forEach((track) => track.stop());
      setVideoStream(null);
    }
  }, [videoStream]);

  // Start Camera Stream
  const startCamera = useCallback(async (deviceId?: string) => {
    stopCamera();
    setCameraError(null);
    setIsCameraStarting(true);

    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('Camera access is not supported by your browser or environment.');
      }

      // Enumerate camera devices
      const allDevices = await navigator.mediaDevices.enumerateDevices();
      const videoDevices = allDevices.filter((d) => d.kind === 'videoinput');
      setCameras(videoDevices);

      const constraints: MediaStreamConstraints = {
        video: deviceId
          ? { deviceId: { exact: deviceId } }
          : {
              facingMode: 'user', // Prefer selfie / front camera by default
              width: { ideal: 640 },
              height: { ideal: 640 },
            },
        audio: false,
      };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      setVideoStream(stream);

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play().catch(console.warn);
      }
    } catch (err: any) {
      console.warn('Failed to access camera:', err);
      setCameraError(err.message || 'Could not access camera. Please check browser permissions.');
    } finally {
      setIsCameraStarting(false);
    }
  }, [stopCamera]);

  // Switch between connected cameras
  const handleSwitchCamera = () => {
    if (cameras.length <= 1) return;
    const currentIndex = cameras.findIndex((c) => c.deviceId === selectedCameraId);
    const nextIndex = (currentIndex + 1) % cameras.length;
    const nextDeviceId = cameras[nextIndex].deviceId;
    setSelectedCameraId(nextDeviceId);
    startCamera(nextDeviceId);
  };

  // Process raw image file or dataUrl: compress to <= 64KB
  const processImage = async (source: File | Blob | string, originalSize = 0) => {
    setIsProcessing(true);
    try {
      const { blob, dataUrl, sizeBytes } = await compressImageTo64KB(source, MAX_AVATAR_SIZE_BYTES);
      setCompressedBlob(blob);
      setPreviewDataUrl(dataUrl);
      setCompressedSizeBytes(sizeBytes);
      setOriginalSizeBytes(originalSize || blob.size);
      
      // Stop camera if photo is taken
      stopCamera();
    } catch (err: any) {
      toast.error('Failed to compress photo. Please select another image.');
    } finally {
      setIsProcessing(false);
    }
  };

  // Capture snapshot from live video stream
  const handleCaptureSnapshot = () => {
    if (!videoRef.current) return;
    const video = videoRef.current;

    // Visual camera shutter flash effect
    setFlashActive(true);
    setTimeout(() => setFlashActive(false), 200);

    const canvas = document.createElement('canvas');
    const width = video.videoWidth || 640;
    const height = video.videoHeight || 640;
    const minSide = Math.min(width, height);
    
    // Crop center square
    canvas.width = 480;
    canvas.height = 480;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Flip horizontally for selfie mirror feel
    ctx.translate(canvas.width, 0);
    ctx.scale(-1, 1);

    const sx = (width - minSide) / 2;
    const sy = (height - minSide) / 2;
    ctx.drawImage(video, sx, sy, minSide, minSide, 0, 0, canvas.width, canvas.height);

    const rawDataUrl = canvas.toDataURL('image/jpeg', 0.9);
    processImage(rawDataUrl, Math.round(rawDataUrl.length * 0.75));
  };

  // Handle file select
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      processImage(file, file.size);
    }
  };

  // Retake or Clear Photo
  const handleRetake = () => {
    setPreviewDataUrl(null);
    setCompressedBlob(null);
    setCompressedSizeBytes(0);
    setOriginalSizeBytes(0);
    if (activeTab === 'camera') {
      startCamera(selectedCameraId);
    }
  };

  // Save / Upload Photo
  const handleConfirmSave = async () => {
    if (!previewDataUrl && !compressedBlob) {
      toast.warning('Please capture a selfie or select a photo first.');
      return;
    }

    setIsUploading(true);
    try {
      const sourceToUpload = compressedBlob || previewDataUrl!;
      const { publicUrl, sizeBytes, isBase64Fallback } = await uploadMemberProfilePhoto(
        sourceToUpload,
        memberId
      );

      const sizeKb = (sizeBytes / 1024).toFixed(1);
      if (isBase64Fallback) {
        toast.info(`Photo saved (${sizeKb} KB). Run migration SQL to activate cloud bucket storage.`);
      } else {
        toast.success(`Profile photo verified & uploaded (${sizeKb} KB / 64 KB limit).`);
      }

      onPhotoSaved(publicUrl);
      handleModalClose();
    } catch (err: any) {
      toast.error(err.message || 'Failed to save profile picture.');
    } finally {
      setIsUploading(false);
    }
  };

  const handleModalClose = () => {
    stopCamera();
    setPreviewDataUrl(null);
    setCompressedBlob(null);
    onClose();
  };

  // Manage camera on tab change & modal open
  useEffect(() => {
    if (isOpen) {
      if (activeTab === 'camera' && !previewDataUrl) {
        startCamera(selectedCameraId);
      }
    } else {
      stopCamera();
    }

    return () => {
      stopCamera();
    };
  }, [isOpen, activeTab, previewDataUrl]);

  if (!isOpen) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-md animate-fade-in font-body text-xs text-(--color-text)">
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 10 }}
        transition={{ duration: 0.2 }}
        className="relative bg-(--bg-card) border border-(--border-color) rounded-3xl w-full max-w-lg shadow-2xl overflow-hidden flex flex-col max-h-[92vh]"
      >
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-(--border-color) flex items-center justify-between bg-(--bg-page) select-none">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-blue-500/10 text-blue-600 dark:text-blue-400 flex items-center justify-center border border-blue-500/20 shadow-xs">
              <Camera className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-heading font-black text-sm uppercase tracking-wider text-(--color-text)">
                Profile Picture Verification
              </h3>
              <p className="text-[11px] text-slate-400 font-medium truncate max-w-xs">
                {memberName} ({memberId})
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={handleModalClose}
            className="p-1.5 rounded-xl bg-(--bg-card) border border-(--border-color) text-slate-400 hover:text-(--color-text) cursor-pointer transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tab Selector */}
        {!previewDataUrl && (
          <div className="p-3 bg-(--bg-card) border-b border-(--border-color) flex gap-2 select-none">
            <button
              type="button"
              onClick={() => {
                setActiveTab('camera');
                startCamera(selectedCameraId);
              }}
              className={`flex-1 py-2 px-3 rounded-xl font-heading text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-2 border transition-all cursor-pointer ${
                activeTab === 'camera'
                  ? 'bg-[#123c73] dark:bg-[#bf0202] text-white border-transparent shadow-xs'
                  : 'bg-(--bg-page) border-(--border-color) text-slate-400 hover:text-(--color-text)'
              }`}
            >
              <Camera className="w-4 h-4" />
              <span>Selfie Camera</span>
            </button>

            <button
              type="button"
              onClick={() => {
                stopCamera();
                setActiveTab('upload');
              }}
              className={`flex-1 py-2 px-3 rounded-xl font-heading text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-2 border transition-all cursor-pointer ${
                activeTab === 'upload'
                  ? 'bg-[#123c73] dark:bg-[#bf0202] text-white border-transparent shadow-xs'
                  : 'bg-(--bg-page) border-(--border-color) text-slate-400 hover:text-(--color-text)'
              }`}
            >
              <Upload className="w-4 h-4" />
              <span>Upload Image</span>
            </button>
          </div>
        )}

        {/* Main Content Area */}
        <div className="p-4 sm:p-6 overflow-y-auto flex-1 flex flex-col items-center justify-center space-y-4">
          {/* CAMERA SHUTTER FLASH OVERLAY */}
          {flashActive && (
            <div className="absolute inset-0 bg-white z-50 pointer-events-none transition-opacity duration-200" />
          )}

          {/* VIEW 1: PREVIEW CAPTURED / SELECTED PHOTO */}
          {previewDataUrl ? (
            <div className="w-full flex flex-col items-center space-y-4 animate-fade-in">
              <div className="relative w-48 h-48 sm:w-56 sm:h-56 rounded-3xl overflow-hidden border-2 border-emerald-500 shadow-xl bg-black">
                <img
                  src={previewDataUrl}
                  alt="Profile preview"
                  className="w-full h-full object-cover"
                />
                <div className="absolute top-2 right-2 px-2 py-1 bg-emerald-600 text-white rounded-lg text-[9px] font-bold uppercase tracking-wider flex items-center gap-1 shadow-md">
                  <CheckCircle2 className="w-3 h-3" /> Ready
                </div>
              </div>

              {/* Compression Metric Details Card */}
              <div className="w-full p-3 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-center space-y-1">
                <div className="flex items-center justify-center gap-1.5 text-emerald-600 dark:text-emerald-400 font-bold text-xs">
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Compressed strictly to ≤ 64 KB limit</span>
                </div>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 font-mono">
                  {originalSizeBytes > 0 && (
                    <span className="line-through mr-1 opacity-70">
                      {(originalSizeBytes / 1024).toFixed(1)} KB
                    </span>
                  )}
                  <span className="font-bold text-emerald-600 dark:text-emerald-400">
                    {(compressedSizeBytes / 1024).toFixed(1)} KB
                  </span>{' '}
                  / 64.0 KB target
                </p>
              </div>

              {/* Action Buttons for Preview */}
              <div className="flex items-center gap-3 w-full">
                <button
                  type="button"
                  onClick={handleRetake}
                  disabled={isUploading}
                  className="flex-1 py-2.5 px-4 rounded-xl border border-(--border-color) bg-(--bg-page) text-slate-600 dark:text-slate-300 hover:text-(--color-text) font-heading text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-2 cursor-pointer transition-all disabled:opacity-50"
                >
                  <RotateCcw className="w-4 h-4" />
                  <span>Retake / Change</span>
                </button>

                <button
                  type="button"
                  onClick={handleConfirmSave}
                  disabled={isUploading}
                  className="flex-1 py-2.5 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-heading text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-2 cursor-pointer transition-all shadow-md disabled:opacity-50"
                >
                  {isUploading ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Saving...</span>
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="w-4 h-4" />
                      <span>Save & Verify</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          ) : activeTab === 'camera' ? (
            /* VIEW 2: LIVE SELFIE CAMERA */
            <div className="w-full flex flex-col items-center space-y-4 animate-fade-in">
              <div className="relative w-56 h-56 sm:w-64 sm:h-64 rounded-3xl overflow-hidden bg-black border-2 border-dashed border-blue-500/40 shadow-inner flex items-center justify-center">
                {isCameraStarting ? (
                  <div className="flex flex-col items-center gap-2 text-slate-400">
                    <Loader2 className="w-6 h-6 animate-spin text-blue-500" />
                    <span className="text-[11px] font-mono">Initializing camera...</span>
                  </div>
                ) : cameraError ? (
                  <div className="p-4 text-center space-y-2">
                    <AlertCircle className="w-8 h-8 text-amber-500 mx-auto" />
                    <p className="text-xs text-amber-500 font-medium leading-tight">
                      {cameraError}
                    </p>
                    <button
                      type="button"
                      onClick={() => startCamera(selectedCameraId)}
                      className="px-3 py-1.5 rounded-lg bg-blue-500/20 text-blue-400 font-bold text-[10px] uppercase tracking-wider cursor-pointer"
                    >
                      Retry Camera
                    </button>
                  </div>
                ) : (
                  <>
                    <video
                      ref={videoRef}
                      autoPlay
                      playsInline
                      muted
                      className="w-full h-full object-cover scale-x-[-1]"
                    />
                    {/* Face Guide Target Overlay */}
                    <div className="absolute inset-4 border border-white/30 rounded-full pointer-events-none flex items-center justify-center">
                      <div className="w-2 h-2 rounded-full bg-white/40" />
                    </div>
                  </>
                )}
              </div>

              {/* Camera Switcher (if multiple cameras exist) */}
              {cameras.length > 1 && !cameraError && (
                <button
                  type="button"
                  onClick={handleSwitchCamera}
                  className="px-3 py-1.5 rounded-xl bg-(--bg-page) border border-(--border-color) text-slate-400 hover:text-(--color-text) text-[11px] font-bold uppercase tracking-wider flex items-center gap-1.5 cursor-pointer shadow-xs transition-colors"
                >
                  <SwitchCamera className="w-3.5 h-3.5 text-blue-500" />
                  <span>Switch Camera</span>
                </button>
              )}

              {/* Shutter Capture Button */}
              {!cameraError && !isCameraStarting && (
                <button
                  type="button"
                  onClick={handleCaptureSnapshot}
                  disabled={isProcessing}
                  className="w-16 h-16 rounded-full bg-white border-4 border-blue-600 shadow-xl flex items-center justify-center cursor-pointer active:scale-90 transition-transform duration-150 hover:bg-slate-100"
                  title="Capture Photo"
                >
                  <div className="w-11 h-11 rounded-full bg-blue-600 flex items-center justify-center">
                    <Camera className="w-5 h-5 text-white" />
                  </div>
                </button>
              )}

              <p className="text-[10px] text-slate-400 text-center font-medium">
                Position your face within the frame and click the shutter button
              </p>
            </div>
          ) : (
            /* VIEW 3: UPLOAD FILE FROM STORAGE */
            <div className="w-full flex flex-col items-center space-y-4 animate-fade-in">
              <div
                onClick={() => fileInputRef.current?.click()}
                className="w-full border-2 border-dashed border-(--border-color) hover:border-blue-500 bg-(--bg-page) rounded-3xl p-8 text-center space-y-3 cursor-pointer transition-all group"
              >
                <div className="w-14 h-14 rounded-2xl bg-blue-500/10 text-blue-600 dark:text-blue-400 flex items-center justify-center mx-auto border border-blue-500/20 group-hover:scale-110 transition-transform">
                  <Upload className="w-7 h-7" />
                </div>
                <div>
                  <h4 className="font-heading font-bold text-xs uppercase tracking-wider text-(--color-text)">
                    Click or Drag to Upload Photo
                  </h4>
                  <p className="text-[11px] text-slate-400 mt-1">
                    Supports JPG, PNG, WEBP (Auto-compressed to ≤ 64 KB)
                  </p>
                </div>
              </div>

              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp,image/*"
                onChange={handleFileChange}
                className="hidden"
              />

              {isProcessing && (
                <div className="flex items-center gap-2 text-blue-500 text-xs font-medium">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Compressing image to 64 KB...</span>
                </div>
              )}
            </div>
          )}
        </div>
      </motion.div>
    </div>,
    document.body
  );
};
