import { i18n } from '../../../i18n';

/**
 * Recipe photos are resized in the browser before they are stored: at most
 * 1600px on the long edge, JPEG at 0.85. A phone photo goes from megabytes to
 * a few hundred kilobytes, which matters for storage and for the family's data.
 */

const MAX_EDGE = 1600;
export const PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

function loadImage(file: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error(i18n.t('add.photo.unreadable')));
    };
    image.src = url;
  });
}

export async function resizePhoto(file: File): Promise<Blob> {
  if (!PHOTO_TYPES.includes(file.type)) throw new Error(i18n.t('add.photo.type'));
  const image = await loadImage(file);
  const scale = Math.min(1, MAX_EDGE / Math.max(image.naturalWidth, image.naturalHeight));
  const width = Math.round(image.naturalWidth * scale);
  const height = Math.round(image.naturalHeight * scale);

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (context === null) throw new Error(i18n.t('add.photo.noResize'));
  // JPEG has no transparency: give PNGs a paper-coloured background.
  context.fillStyle = '#fffdf8';
  context.fillRect(0, 0, width, height);
  context.drawImage(image, 0, 0, width, height);

  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob === null ? reject(new Error(i18n.t('add.photo.unsaved'))) : resolve(blob)), 'image/jpeg', 0.85);
  });
}
