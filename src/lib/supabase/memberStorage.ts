// src/lib/supabase/memberStorage.ts
import { supabase } from './client';

export const MAX_AVATAR_SIZE_BYTES = 2 * 1024 * 1024; // 2 MB (2,097,152 bytes)
export const MEMBER_AVATARS_BUCKET = 'member-avatars';

export interface CompressResult {
  blob: Blob;
  dataUrl: string;
  sizeBytes: number;
  width: number;
  height: number;
}

export interface UploadAvatarResult {
  publicUrl: string;
  sizeBytes: number;
  isBase64Fallback: boolean;
}

const resolveImageSource = (
  source: File | Blob | HTMLCanvasElement | string
): Promise<HTMLImageElement | HTMLCanvasElement> => {
  return new Promise((resolve, reject) => {
    if (source instanceof HTMLCanvasElement) {
      resolve(source);
      return;
    }

    const img = new Image();
    img.crossOrigin = 'anonymous';

    img.onload = () => resolve(img);
    img.onerror = () =>
      reject(new Error('Failed to load image source for compression'));

    if (typeof source === 'string') {
      img.src = source;
    } else {
      const reader = new FileReader();
      reader.onload = (e) => {
        img.src = e.target?.result as string;
      };
      reader.onerror = () =>
        reject(new Error('Failed to read image file data'));
      reader.readAsDataURL(source);
    }
  });
};

/**
 * Center-crops to 1:1 square and resizes up to 1024x1024 px HD resolution.
 */
export async function compressImageTo1024(
  source: File | Blob | HTMLCanvasElement | string,
  maxDimension: number = 1024,
  quality: number = 0.85
): Promise<CompressResult> {
  const imageElement = await resolveImageSource(source);

  const srcWidth =
    'videoWidth' in imageElement
      ? (imageElement as any).videoWidth
      : imageElement.width;
  const srcHeight =
    'videoHeight' in imageElement
      ? (imageElement as any).videoHeight
      : imageElement.height;

  if (!srcWidth || !srcHeight) {
    throw new Error('Invalid image dimensions detected');
  }

  // 1:1 Center crop math
  const minSide = Math.min(srcWidth, srcHeight);
  const sx = (srcWidth - minSide) / 2;
  const sy = (srcHeight - minSide) / 2;

  // Scale down only if original is larger than maxDimension
  const targetDim = Math.min(minSide, maxDimension);

  return new Promise((resolve, reject) => {
    try {
      const canvas = document.createElement('canvas');
      canvas.width = targetDim;
      canvas.height = targetDim;

      const ctx = canvas.getContext('2d');
      if (!ctx) {
        throw new Error('Failed to acquire 2D canvas context');
      }

      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';

      // Draw center-cropped square
      ctx.drawImage(
        imageElement,
        sx,
        sy,
        minSide,
        minSide,
        0,
        0,
        targetDim,
        targetDim
      );

      const mimeType = 'image/webp';
      const dataUrl = canvas.toDataURL(mimeType, quality);

      canvas.toBlob(
        (blob) => {
          if (blob) {
            resolve({
              blob,
              dataUrl,
              sizeBytes: blob.size,
              width: targetDim,
              height: targetDim,
            });
          } else {
            // Fallback to JPEG
            canvas.toBlob(
              (jpegBlob) => {
                if (jpegBlob) {
                  const jpegDataUrl = canvas.toDataURL('image/jpeg', quality);
                  resolve({
                    blob: jpegBlob,
                    dataUrl: jpegDataUrl,
                    sizeBytes: jpegBlob.size,
                    width: targetDim,
                    height: targetDim,
                  });
                } else {
                  reject(new Error('Canvas blob generation failed'));
                }
              },
              'image/jpeg',
              quality
            );
          }
        },
        mimeType,
        quality
      );
    } catch (err) {
      reject(err);
    }
  });
}

// Backward-compatibility aliases
export const compressImageTo64x64 = (s: any) =>
  compressImageTo1024(s, 1024, 0.85);
export const compressImageTo64KB = (s: any) =>
  compressImageTo1024(s, 1024, 0.85);

/**
 * Extracts the storage file path from a Supabase public URL or relative path string.
 */
export function extractAvatarPath(
  url?: string | null,
  bucketName = MEMBER_AVATARS_BUCKET
): string | null {
  if (!url || typeof url !== 'string' || !url.trim()) return null;
  const trimmed = url.trim();

  // If it's a data URL or blob URL, there is no storage path
  if (trimmed.startsWith('data:') || trimmed.startsWith('blob:')) {
    return null;
  }

  try {
    if (trimmed.includes(`/storage/v1/object/public/${bucketName}/`)) {
      return decodeURIComponent(
        trimmed
          .split(`/storage/v1/object/public/${bucketName}/`)[1]
          .split('?')[0]
      );
    }
    if (trimmed.includes(`/${bucketName}/`)) {
      return decodeURIComponent(
        trimmed.split(`/${bucketName}/`)[1].split('?')[0]
      );
    }
    if (!trimmed.startsWith('http://') && !trimmed.startsWith('https://')) {
      return decodeURIComponent(trimmed.replace(/^\/+/, '').split('?')[0]);
    }
    const parsed = new URL(trimmed);
    const parts = parsed.pathname.split(`/${bucketName}/`);
    if (parts.length > 1) {
      return decodeURIComponent(parts[1].split('?')[0]);
    }
  } catch (e) {
    console.warn('Error extracting avatar path:', e);
  }
  return null;
}

/**
 * Deletes all matching avatar files for a member from the Supabase bucket to prevent file stacking.
 */
export async function deleteMemberAvatarFromBucket(
  memberId: string,
  currentImageUrl?: string | null
): Promise<void> {
  const filesToDelete = new Set<string>();

  // 1. Add specific file path if available from URL
  if (currentImageUrl) {
    const explicitPath = extractAvatarPath(
      currentImageUrl,
      MEMBER_AVATARS_BUCKET
    );
    if (explicitPath) {
      filesToDelete.add(explicitPath);
    }
  }

  const cleanId = (memberId || '').replace(/[^a-zA-Z0-9_-]/g, '_').trim();
  if (!cleanId) {
    if (filesToDelete.size > 0) {
      await supabase.storage
        .from(MEMBER_AVATARS_BUCKET)
        .remove(Array.from(filesToDelete));
    }
    return;
  }

  // 2. Search and purge older files in 'profiles/' folder
  try {
    const { data: profileFiles } = await supabase.storage
      .from(MEMBER_AVATARS_BUCKET)
      .list('profiles', { search: cleanId });

    if (profileFiles && profileFiles.length > 0) {
      profileFiles.forEach((file) => {
        if (file.name.includes(cleanId)) {
          filesToDelete.add(`profiles/${file.name}`);
        }
      });
    }
  } catch (err) {
    console.warn('Could not list profiles folder in bucket:', err);
  }

  // 3. Search and purge older files in root bucket directory
  try {
    const { data: rootFiles } = await supabase.storage
      .from(MEMBER_AVATARS_BUCKET)
      .list('', { search: cleanId });

    if (rootFiles && rootFiles.length > 0) {
      rootFiles.forEach((file) => {
        if (file.name.includes(cleanId)) {
          filesToDelete.add(file.name);
        }
      });
    }
  } catch (err) {
    console.warn('Could not list root bucket directory:', err);
  }

  // 4. Batch delete all resolved files
  const fileArray = Array.from(filesToDelete);
  if (fileArray.length > 0) {
    const { error } = await supabase.storage
      .from(MEMBER_AVATARS_BUCKET)
      .remove(fileArray);

    if (error) {
      console.warn(
        `Failed to delete files from '${MEMBER_AVATARS_BUCKET}':`,
        error.message
      );
    }
  }
}

/**
 * Uploads member avatar at 1024x1024 HD to Supabase Storage,
 * automatically purging any old files for that member to prevent stacking.
 */
export async function uploadMemberProfilePhoto(
  source: File | Blob | HTMLCanvasElement | string,
  memberId: string
): Promise<UploadAvatarResult> {
  // 1. Process image to 1024x1024 square HD WebP
  const { blob, dataUrl, sizeBytes } = await compressImageTo1024(
    source,
    1024,
    0.85
  );

  const cleanId = (memberId || 'member').replace(/[^a-zA-Z0-9_-]/g, '_');
  const fileExt = blob.type === 'image/webp' ? 'webp' : 'jpg';
  const fileName = `profiles/${cleanId}_${Date.now()}.${fileExt}`;

  // 2. Clear old files for this member before uploading new one
  try {
    await deleteMemberAvatarFromBucket(memberId);
  } catch (cleanupErr) {
    console.warn('Old avatar cleanup skipped or failed:', cleanupErr);
  }

  // 3. Upload new photo to Supabase storage
  try {
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from(MEMBER_AVATARS_BUCKET)
      .upload(fileName, blob, {
        contentType: blob.type || 'image/webp',
        upsert: true,
        cacheControl: '3600',
      });

    if (uploadError) {
      console.warn(
        `Storage upload to '${MEMBER_AVATARS_BUCKET}' failed:`,
        uploadError.message
      );

      return {
        publicUrl: dataUrl,
        sizeBytes,
        isBase64Fallback: true,
      };
    }

    const { data: pubData } = supabase.storage
      .from(MEMBER_AVATARS_BUCKET)
      .getPublicUrl(uploadData?.path || fileName);

    return {
      publicUrl: pubData?.publicUrl || dataUrl,
      sizeBytes,
      isBase64Fallback: false,
    };
  } catch (err: any) {
    console.warn('Storage upload exception, using dataUrl fallback:', err);
    return {
      publicUrl: dataUrl,
      sizeBytes,
      isBase64Fallback: true,
    };
  }
}

export async function uploadMemberAvatar(
  arg1: string | File | Blob | HTMLCanvasElement,
  arg2: string | File | Blob | HTMLCanvasElement
): Promise<string> {
  let memberId = '';
  let source: File | Blob | HTMLCanvasElement | string = '';

  if (
    typeof arg1 === 'string' &&
    (arg2 instanceof Blob ||
      arg2 instanceof HTMLCanvasElement ||
      typeof arg2 === 'string')
  ) {
    memberId = arg1;
    source = arg2;
  } else {
    source = arg1;
    memberId = typeof arg2 === 'string' ? arg2 : 'member';
  }

  const result = await uploadMemberProfilePhoto(source, memberId);
  return result.publicUrl;
}
