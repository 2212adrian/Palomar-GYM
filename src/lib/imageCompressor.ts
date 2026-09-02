//src/lib/imageCompressor.ts
/**
 * Utility to compress any image down to a specified target file size (in bytes)
 * using an adaptive HTML5 Canvas rescaling algorithm.
 */
export const compressImage = (
  file: File,
  targetSizeBytes: number
): Promise<File> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = (event) => {
      const img = new Image();
      img.src = event.target?.result as string;
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;

        const maxDimension = 1000;
        if (width > maxDimension || height > maxDimension) {
          if (width > height) {
            height = Math.round((height * maxDimension) / width);
            width = maxDimension;
          } else {
            width = Math.round((width * maxDimension) / height);
            height = maxDimension;
          }
        }

        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Failed to parse 2D canvas configuration context'));
          return;
        }
        bgDrawImage(ctx, img, width, height);

        const getBlobAtQuality = (quality: number): Promise<Blob> => {
          return new Promise((resolveBlob) => {
            canvas.toBlob(
              (blob) => {
                if (blob) resolveBlob(blob);
              },
              'image/jpeg',
              quality
            );
          });
        };

        const executeAdaptiveCompression = async () => {
          let currentQuality = 0.85;
          let blob = await getBlobAtQuality(currentQuality);

          if (blob.size > targetSizeBytes) {
            currentQuality = 0.6;
            blob = await getBlobAtQuality(currentQuality);
          }
          if (blob.size > targetSizeBytes) {
            currentQuality = 0.35;
            blob = await getBlobAtQuality(currentQuality);
          }

          const compressedFile = new File(
            [blob],
            file.name.replace(/\.[^/.]+$/, '.jpg'),
            {
              type: 'image/jpeg',
              lastModified: Date.now(),
            }
          );

          resolve(compressedFile);
        };

        executeAdaptiveCompression().catch(reject);
      };
      img.onerror = () =>
        reject(new Error('Failed to render loaded picture template'));
    };
    reader.onerror = () =>
      reject(new Error('Failed to read selected image data stream'));
  });
};

// Helper function to safely paint composite layers
const bgDrawImage = (
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  w: number,
  h: number
) => {
  ctx.drawImage(img, 0, 0, w, h);
};
