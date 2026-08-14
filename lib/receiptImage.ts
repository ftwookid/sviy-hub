/**
 * Client-side receipt compression.
 *
 * Raw phone photos run 2-5 MB each. At ~40 receipts a month that fills the 1 GB
 * Supabase free tier inside a year. Resizing to 2000px on the long edge at JPEG
 * ~0.82 brings a typical receipt photo to ~300 KB — about a 10x saving — while
 * keeping printed receipt text comfortably legible for an IRS audit.
 *
 * PDFs and anything non-image pass through untouched.
 */

const MAX_EDGE = 2000;
const JPEG_QUALITY = 0.82;
/** Below this, re-encoding usually costs more bytes than it saves. */
const SKIP_BELOW_BYTES = 400_000;

export type PreparedReceipt = {
  file: File;
  originalBytes: number;
  compressedBytes: number;
  wasCompressed: boolean;
};

export function isImageFile(file: File) {
  return file.type.startsWith("image/");
}

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const image = new Image();

    image.onload = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("Could not read that image."));
    };
    image.src = objectUrl;
  });
}

function canvasToBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob), "image/jpeg", quality);
  });
}

function jpegName(name: string) {
  const base = name.replace(/\.[^.]+$/, "");
  return `${base || "receipt"}.jpg`;
}

/**
 * Returns a compressed JPEG when that is actually smaller, and the original file
 * otherwise. Never throws on compression failure — a slightly larger upload beats
 * losing the receipt.
 */
export async function prepareReceiptFile(file: File): Promise<PreparedReceipt> {
  const untouched: PreparedReceipt = {
    file,
    originalBytes: file.size,
    compressedBytes: file.size,
    wasCompressed: false
  };

  if (!isImageFile(file) || file.size < SKIP_BELOW_BYTES) return untouched;
  if (typeof document === "undefined") return untouched;

  try {
    const image = await loadImage(file);
    const longEdge = Math.max(image.width, image.height);
    const scale = longEdge > MAX_EDGE ? MAX_EDGE / longEdge : 1;
    const width = Math.round(image.width * scale);
    const height = Math.round(image.height * scale);

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;

    const context = canvas.getContext("2d");
    if (!context) return untouched;

    // White base: receipts are usually white, and JPEG has no alpha channel, so
    // a transparent PNG source would otherwise flatten to black.
    context.fillStyle = "#FFFFFF";
    context.fillRect(0, 0, width, height);
    context.imageSmoothingQuality = "high";
    context.drawImage(image, 0, 0, width, height);

    const blob = await canvasToBlob(canvas, JPEG_QUALITY);
    if (!blob || blob.size >= file.size) return untouched;

    return {
      file: new File([blob], jpegName(file.name), { type: "image/jpeg" }),
      originalBytes: file.size,
      compressedBytes: blob.size,
      wasCompressed: true
    };
  } catch {
    return untouched;
  }
}

export function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
