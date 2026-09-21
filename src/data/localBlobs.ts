import type { BlobStorage } from './types';

/**
 * Browser-only blob storage: images are resized in a canvas and returned as a
 * data URL, so an image travels inside the row that references it.
 * The Supabase backend will replace this with an upload to the photos bucket.
 */

const MAX_EDGE = 900;
const JPEG_QUALITY = 0.8;

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Could not read that image'));
    };
    image.src = url;
  });
}

function scaleToFit(width: number, height: number): { width: number; height: number } {
  const longest = Math.max(width, height);
  if (longest <= MAX_EDGE) return { width, height };
  const ratio = MAX_EDGE / longest;
  return {
    width: Math.max(1, Math.round(width * ratio)),
    height: Math.max(1, Math.round(height * ratio)),
  };
}

export const localBlobs: BlobStorage = {
  async putImage(file: File): Promise<string> {
    const image = await loadImage(file);
    const size = scaleToFit(image.naturalWidth, image.naturalHeight);

    const canvas = document.createElement('canvas');
    canvas.width = size.width;
    canvas.height = size.height;

    const context = canvas.getContext('2d');
    if (context === null) {
      throw new Error('Could not resize that image');
    }
    context.drawImage(image, 0, 0, size.width, size.height);

    return canvas.toDataURL('image/jpeg', JPEG_QUALITY);
  },
};
