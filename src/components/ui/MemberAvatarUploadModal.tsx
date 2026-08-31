// src/components/ui/MemberAvatarUploadModal.tsx

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Camera, Upload, RefreshCw, Check, AlertCircle, Sparkles } from 'lucide-react';
import { Modal } from './Modal';
import { compressImageTo1024, uploadMemberAvatar, type CompressResult } from '../../lib/supabase/memberStorage';
import { toast } from 'react-toastify';

interface MemberAvatarUploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  memberName: string;
  memberId: string;
  currentImageUrl?: string | null;
  onSaveSuccess: (newUrl: string) => void;
}

export const MemberAvatarUploadModal: React.FC<MemberAvatarUploadModalProps> = ({
  isOpen,
  onClose,
  memberName,
  memberId,
  onSaveSuccess,
}) => {
  const [activeTab, setActiveTab] = useState<'camera' | 'upload'>('camera');
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [previewResult, setPreviewResult] = useState<CompressResult | null>(null);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [isUploading, setIsUploading] = useState<boolean>(false);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const stopCamera = useCallback(() => {
    if (cameraStream) {
      cameraStream.getTracks().forEach((track) => {
        track.stop();
        track.enabled = false;
      });
      setCameraStream(null);
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  }, [cameraStream]);

  const startCamera = useCallback(async () => {
    setCameraError(null);
    stopCamera();

    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('Camera access is not supported on this browser/environment.');
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 1024 },
          height: { ideal: 1024 },
          facingMode: 'user'
        },
        audio: false
      });

      setCameraStream(stream);

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.onloadedmetadata = () => {
          videoRef.current?.play().catch(() => {});
        };
      }
    } catch (err: any) {
      console.warn('Camera request failed:', err);
      setCameraError(
        err.name === 'NotAllowedError'
          ? 'Camera permission denied. Please enable camera access in browser settings.'
          : err.message || 'Unable to access camera device.'
      );
    }
  }, [stopCamera]);

  useEffect(() => {
    if (isOpen && activeTab === 'camera' && !previewResult) {
      startCamera();
    } else {
      stopCamera();
    }
    return () => stopCamera();
  }, [isOpen, activeTab, previewResult, startCamera, stopCamera]);

  const handleCapturePhoto = async () => {
    if (!videoRef.current || isProcessing) return;
    setIsProcessing(true);

    try {
      const video = videoRef.current;
      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth || 1024;
      canvas.height = video.videoHeight || 1024;

      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Failed to acquire canvas context');

      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

      // Compress to 1024x1024 HD
      const result = await compressImageTo1024(canvas, 1024, 0.85);
      setPreviewResult(result);
      stopCamera();
    } catch (err: any) {
      toast.error('Failed to capture photo: ' + err.message);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      toast.warning('Please select a valid image file (PNG, JPEG, WebP).');
      e.target.value = '';
      return;
    }

    setIsProcessing(true);
    try {
      const result = await compressImageTo1024(file, 1024, 0.85);
      setPreviewResult(result);
      stopCamera();
    } catch (err: any) {
      toast.error('Failed to process image: ' + err.message);
    } finally {
      setIsProcessing(false);
      e.target.value = ''; // Reset so the same file can be re-selected if needed
    }
  };

  const handleConfirmSave = async () => {
    if (!previewResult) return;
    setIsUploading(true);

    try {
      const publicUrl = await uploadMemberAvatar(memberId, previewResult.blob);
      toast.success('Member photo updated (1024x1024 HD).');
      onSaveSuccess(publicUrl);
      onClose();
    } catch (err: any) {
      toast.error('Upload failed: ' + err.message);
    } finally {
      setIsUploading(false);
    }
  };

  const handleRetake = () => {
    setPreviewResult(null);
    if (activeTab === 'camera') {
      startCamera();
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={() => {
        stopCamera();
        onClose();
      }}
      title="UPDATE MEMBER PROFILE PHOTO"
    >
      <div className="space-y-4 text-left font-body">
        {/* GLOBAL HIDDEN FILE INPUT (STAYS MOUNTED IN ALL MODES) */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          onChange={handleFileSelect}
          className="hidden"
        />

        {/* MEMBER DETAILS HEADER */}
        <div className="flex items-center justify-between p-3 bg-(--bg-page) border border-(--border-color) rounded-2xl">
          <div>
            <h4 className="font-extrabold text-sm text-(--color-text) leading-tight">{memberName}</h4>
            <span className="text-xs text-slate-400 font-mono">{memberId}</span>
          </div>
          <span className="px-2.5 py-1 rounded-full text-[10px] font-mono font-bold bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20">
            Max 1024x1024 HD
          </span>
        </div>

        {/* TAB SWITCHER */}
        {!previewResult && (
          <div className="grid grid-cols-2 gap-2 bg-(--bg-page) p-1 rounded-xl border border-(--border-color)">
            <button
              type="button"
              onClick={() => {
                setActiveTab('camera');
                setPreviewResult(null);
              }}
              className={`py-2 px-3 rounded-lg text-xs font-heading font-extrabold uppercase tracking-wider flex items-center justify-center gap-2 cursor-pointer transition-all ${
                activeTab === 'camera'
                  ? 'bg-[#123c73] dark:bg-[#bf0202] text-white shadow-md'
                  : 'text-slate-400 hover:text-(--color-text)'
              }`}
            >
              <Camera className="w-4 h-4" />
              <span>Take Selfie</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setActiveTab('upload');
                stopCamera();
              }}
              className={`py-2 px-3 rounded-lg text-xs font-heading font-extrabold uppercase tracking-wider flex items-center justify-center gap-2 cursor-pointer transition-all ${
                activeTab === 'upload'
                  ? 'bg-[#123c73] dark:bg-[#bf0202] text-white shadow-md'
                  : 'text-slate-400 hover:text-(--color-text)'
              }`}
            >
              <Upload className="w-4 h-4" />
              <span>Upload Image</span>
            </button>
          </div>
        )}

        {/* VIEWFINDER / UPLOAD / PREVIEW CONTAINER */}
        <div className="relative rounded-2xl overflow-hidden bg-black/90 border border-zinc-800 flex flex-col items-center justify-center min-h-[280px] p-4 text-center">
          {previewResult ? (
            <div className="space-y-3 animate-fade-in flex flex-col items-center">
              <div className="relative">
                <div className="w-40 h-40 rounded-2xl overflow-hidden border-2 border-emerald-500 shadow-2xl p-0.5 bg-black">
                  <img
                    src={previewResult.dataUrl}
                    alt="1024x1024 Preview"
                    className="w-full h-full object-cover rounded-xl"
                  />
                </div>
                <span className="absolute -bottom-2 -right-2 w-6 h-6 rounded-full bg-emerald-500 text-white flex items-center justify-center shadow-md">
                  <Check className="w-3.5 h-3.5" />
                </span>
              </div>

              <div className="space-y-0.5">
                <div className="flex items-center justify-center gap-1.5 text-xs font-bold text-emerald-400">
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>HD 1024x1024 Resolution</span>
                </div>
                <p className="text-[11px] font-mono text-zinc-400">
                  Optimized size: <strong>{(previewResult.sizeBytes / 1024).toFixed(1)} KB</strong>
                </p>
              </div>
            </div>
          ) : activeTab === 'camera' ? (
            <div className="w-full flex flex-col items-center space-y-3">
              {cameraError ? (
                <div className="p-4 bg-rose-500/10 border border-rose-500/30 rounded-xl text-rose-300 text-xs space-y-2 max-w-sm">
                  <AlertCircle className="w-5 h-5 text-rose-400 mx-auto" />
                  <p className="font-bold">{cameraError}</p>
                  <button
                    type="button"
                    onClick={() => {
                      setActiveTab('upload');
                      fileInputRef.current?.click();
                    }}
                    className="px-3 py-1.5 bg-rose-600 text-white rounded-lg text-xs font-bold cursor-pointer hover:bg-rose-500"
                  >
                    Switch to File Upload
                  </button>
                </div>
              ) : (
                <>
                  <div className="relative w-56 h-56 rounded-2xl overflow-hidden border-2 border-dashed border-blue-500 shadow-inner bg-black flex items-center justify-center">
                    <video
                      ref={videoRef}
                      autoPlay
                      playsInline
                      muted
                      className="w-full h-full object-cover"
                    />
                    <div className="absolute inset-0 border-4 border-white/20 rounded-2xl pointer-events-none" />
                  </div>
                  <span className="text-[11px] font-mono text-zinc-400">
                    Align face inside the square guide
                  </span>
                </>
              )}
            </div>
          ) : (
            <div
              onClick={() => fileInputRef.current?.click()}
              className="w-full h-56 border-2 border-dashed border-zinc-700 hover:border-blue-500 rounded-2xl flex flex-col items-center justify-center cursor-pointer p-4 transition-colors space-y-2 group"
            >
              <div className="w-12 h-12 rounded-2xl bg-zinc-800 group-hover:bg-blue-600/20 text-slate-300 group-hover:text-blue-400 flex items-center justify-center transition-colors">
                <Upload className="w-6 h-6" />
              </div>
              <p className="text-xs font-bold text-slate-200">
                Click or drag & drop photo here
              </p>
              <p className="text-[10px] text-zinc-400 font-mono">
                Automatically cropped to 1:1 HD square
              </p>
            </div>
          )}
        </div>

        {/* BOTTOM ACTION BUTTONS */}
        <div className="flex items-center justify-between gap-2 pt-2 border-t border-(--border-color)">
          <button
            type="button"
            onClick={() => {
              stopCamera();
              onClose();
            }}
            className="px-4 py-2.5 bg-slate-200 dark:bg-zinc-800 text-slate-700 dark:text-slate-300 rounded-xl text-xs font-heading font-bold uppercase cursor-pointer border-none"
          >
            Cancel
          </button>

          <div className="flex items-center gap-2">
            {previewResult ? (
              <>
                <button
                  type="button"
                  onClick={handleRetake}
                  disabled={isUploading}
                  className="px-3.5 py-2.5 bg-slate-200 dark:bg-zinc-800 hover:bg-slate-300 dark:hover:bg-zinc-700 text-slate-700 dark:text-slate-300 rounded-xl text-xs font-heading font-bold uppercase cursor-pointer border-none flex items-center gap-1.5"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>Retake</span>
                </button>

                <button
                  type="button"
                  onClick={handleConfirmSave}
                  disabled={isUploading}
                  className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-heading font-bold uppercase tracking-wider cursor-pointer border-none shadow-md flex items-center gap-2"
                >
                  {isUploading ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      <span>Saving...</span>
                    </>
                  ) : (
                    <>
                      <Check className="w-4 h-4" />
                      <span>Save & Apply</span>
                    </>
                  )}
                </button>
              </>
            ) : activeTab === 'camera' && !cameraError ? (
              <button
                type="button"
                onClick={handleCapturePhoto}
                disabled={isProcessing}
                className="px-6 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-heading font-bold uppercase tracking-wider cursor-pointer border-none shadow-md flex items-center gap-2"
              >
                <Camera className="w-4 h-4" />
                <span>Snap Photo</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="px-5 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-heading font-bold uppercase tracking-wider cursor-pointer border-none shadow-md flex items-center gap-2"
              >
                <Upload className="w-4 h-4" />
                <span>Browse File</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </Modal>
  );
};