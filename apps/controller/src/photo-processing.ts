import { PLAYER_PHOTO_MAX_BYTES } from "@morder/shared";

export const PHOTO_MAX_EDGE = 512;
export const PHOTO_JPEG_QUALITY = 0.82;

interface DecodedImage {
  source: CanvasImageSource;
  width: number;
  height: number;
  close: () => void;
}

export const calculatePhotoDimensions = (
  width: number,
  height: number,
  maxEdge = PHOTO_MAX_EDGE,
) => {
  if (width <= 0 || height <= 0 || maxEdge <= 0) {
    throw new Error("The selected image has invalid dimensions.");
  }
  const scale = Math.min(1, maxEdge / Math.max(width, height));
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
};

const decodeWithImageElement = (file: File) =>
  new Promise<DecodedImage>((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const image = new Image();
    image.decoding = "async";
    image.onload = () =>
      resolve({
        source: image,
        width: image.naturalWidth,
        height: image.naturalHeight,
        close: () => URL.revokeObjectURL(objectUrl),
      });
    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("This browser could not read the selected image."));
    };
    image.src = objectUrl;
  });

const decodeImage = async (file: File): Promise<DecodedImage> => {
  if (typeof createImageBitmap === "function") {
    try {
      const bitmap = await createImageBitmap(file, {
        imageOrientation: "from-image",
      });
      return {
        source: bitmap,
        width: bitmap.width,
        height: bitmap.height,
        close: () => bitmap.close(),
      };
    } catch {
      // The image element fallback covers browsers and formats that do not
      // support createImageBitmap. Modern browsers apply EXIF orientation here.
    }
  }
  return decodeWithImageElement(file);
};

const canvasToJpeg = (canvas: HTMLCanvasElement) =>
  new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) {
          resolve(blob);
          return;
        }
        reject(new Error("This browser could not prepare the selected image."));
      },
      "image/jpeg",
      PHOTO_JPEG_QUALITY,
    );
  });

export const preparePlayerPhoto = async (file: File) => {
  if (!file.type.startsWith("image/")) {
    throw new Error("Choose an image from the camera or photo library.");
  }

  const decoded = await decodeImage(file);
  try {
    const dimensions = calculatePhotoDimensions(decoded.width, decoded.height);
    const canvas = document.createElement("canvas");
    canvas.width = dimensions.width;
    canvas.height = dimensions.height;
    const context = canvas.getContext("2d");
    if (!context) {
      throw new Error("This browser cannot prepare photos.");
    }
    context.drawImage(decoded.source, 0, 0, dimensions.width, dimensions.height);
    const blob = await canvasToJpeg(canvas);
    if (blob.size > PLAYER_PHOTO_MAX_BYTES) {
      throw new Error("The processed photo is still too large. Choose another image.");
    }
    return blob;
  } finally {
    decoded.close();
  }
};
