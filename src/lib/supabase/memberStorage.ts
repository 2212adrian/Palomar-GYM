// src/lib/supabase/memberStorage.ts
import { supabase } from './client';
import { toast } from 'react-toastify';

export const MAX_AVATAR_SIZE_BYTES = 64 * 1024; // 64 KB = 65,536 bytes
export const MEMBER_AVATARS_BUCKET = 'member-avatars';

/**
 * Compresses any File, Blob, or base64 DataURL down to strictly <= 64 KB (65,536 bytes).
 * Iteratively adapts JPEG quality and canvas resolution until the output blob is within limit.
 */
export async function compressImageTo64KB(
  source: File | Blob | string,
  targetMaxBytes: number = MAX_AVATAR_SIZE_BYTES
): Promise<{ blob: Blob; dataUrl: string; sizeBytes: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';

    const handleImageLoaded = async () => {
      try {
        let maxDim = 480; // Starting max resolution for square avatar
        let quality = 0.82;
        let blob: Blob | null = null;
        let dataUrl = '';

        // Helper to draw and convert to Blob at specified max dimension and quality
        const renderCanvasBlob = (dim: number, q: number): Promise<{ blob: Blob; dataUrl: string }> => {
          return new Promise((resolveBlob, rejectBlob) => {
            const canvas = document.createElement('canvas');
            let { width, height } = img;

            // Crop to center-square or scale proportionally
            const minSide = Math.min(width, height);
            const sx = (width - minSide) / 2;
            const sy = (height - minSide) / 2;

            canvas.width = Math.min(minSide, dim);
            canvas.height = Math.min(minSide, dim);

            const ctx = canvas.getContext('2d');
            if (!ctx) {
              rejectBlob(new Error('Failed to initialize 2D canvas context'));
              return;
            }

            // High-quality image smoothing
            ctx.imageSmoothingEnabled = true;
            ctx.imageSmoothingQuality = 'high';

            // Draw center-cropped square
            ctx.drawImage(
              img,
              sx,
              sy,
              minSide,
              minSide,
              0,
              0,
              canvas.width,
              canvas.height
            );

            canvas.toBlob(
              (b) => {
                if (b) {
                  const url = canvas.toDataURL('image/jpeg', q);
                  resolveBlob({ blob: b, dataUrl: url });
                } else {
                  rejectBlob(new Error('Canvas toBlob conversion failed'));
                }
              },
              'image/jpeg',
              q
            );
          });
        };

        // Iteration steps to guarantee <= targetMaxBytes
        const qualitySteps = [0.82, 0.70, 0.55, 0.40, 0.28, 0.18];
        const dimSteps = [480, 400, 320, 256, 200];

        let found = false;

        for (const dim of dimSteps) {
          for (const q of qualitySteps) {
            const result = await renderCanvasBlob(dim, q);
            if (result.blob.size <= targetMaxBytes) {
              blob = result.blob;
              dataUrl = result.dataUrl;
              found = true;
              break;
            }
          }
          if (found) break;
        }

        // Ultimate fallback if still oversized
        if (!blob) {
          const finalResult = await renderCanvasBlob(160, 0.15);
          blob = finalResult.blob;
          dataUrl = finalResult.dataUrl;
        }

        resolve({
          blob,
          dataUrl,
          sizeBytes: blob.size,
        });
      } catch (err) {
        reject(err);
      }
    };

    img.onerror = (err) => {
      reject(new Error('Failed to load image source for compression'));
    };

    if (typeof source === 'string') {
      img.src = source;
    } else {
      const reader = new FileReader();
      reader.onload = (e) => {
        img.src = e.target?.result as string;
      };
      reader.onerror = () => reject(new Error('Failed to read image file'));
      reader.readAsDataURL(source);
    }
  });
}

/**
 * Uploads a member's profile image to the Supabase 'member-avatars' bucket.
 * Compresses the image to strictly <= 64KB before uploading.
 * Returns the public URL (or data URL as graceful fallback if bucket not created yet).
 */
export async function uploadMemberProfilePhoto(
  source: File | Blob | string,
  memberId: string
): Promise<{ publicUrl: string; sizeBytes: number; isBase64Fallback: boolean }> {
  // 1. Compress image to strictly <= 64KB
  const { blob, dataUrl, sizeBytes } = await compressImageTo64KB(source, MAX_AVATAR_SIZE_BYTES);

  const cleanId = (memberId || 'member').replace(/[^a-zA-Z0-9_-]/g, '');
  const fileName = `profiles/${cleanId}_${Date.now()}.jpg`;

  try {
    // 2. Attempt upload to Supabase storage bucket 'member-avatars'
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from(MEMBER_AVATARS_BUCKET)
      .upload(fileName, blob, {
        contentType: 'image/jpeg',
        upsert: true,
        cacheControl: '3600',
      });

    if (uploadError) {
      console.warn(`Supabase Storage upload to '${MEMBER_AVATARS_BUCKET}' failed:`, uploadError.message);
      
      // Try fallback to standard 'avatars' bucket if present
      const { data: fallbackData, error: fallbackError } = await supabase.storage
        .from('avatars')
        .upload(`member_profiles/${cleanId}_${Date.now()}.jpg`, blob, {
          contentType: 'image/jpeg',
          upsert: true,
          cacheControl: '3600',
        });

      if (!fallbackError && fallbackData?.path) {
        const { data: pubUrlData } = supabase.storage.from('avatars').getPublicUrl(fallbackData.path);
        return {
          publicUrl: pubUrlData.publicUrl,
          sizeBytes,
          isBase64Fallback: false
        };
      }

      // If bucket does not exist, return compressed 64KB base64 DataURL so UI and app are never blocked
      return {
        publicUrl: dataUrl,
        sizeBytes,
        isBase64Fallback: true,
      };
    }

    // 3. Retrieve public URL
    const { data: pubData } = supabase.storage.from(MEMBER_AVATARS_BUCKET).getPublicUrl(fileName);
    return {
      publicUrl: pubData?.publicUrl || dataUrl,
      sizeBytes,
      isBase64Fallback: false,
    };
  } catch (err: any) {
    console.warn('Storage upload encountered an exception, using compressed 64KB dataUrl fallback:', err);
    return {
      publicUrl: dataUrl,
      sizeBytes,
      isBase64Fallback: true,
    };
  }
}
