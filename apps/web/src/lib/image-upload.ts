// Explicit .ts extension: this module is exercised by `node --test`, whose ESM
// resolver needs it. tsconfig sets allowImportingTsExtensions; Turbopack resolves
// it fine. Don't "normalize" to "./api" — it breaks the test loader.
import { api, ApiClientError } from "./api.ts";

const PUBLIC_BASE =
  process.env.NEXT_PUBLIC_S3_PUBLIC_URL ?? "http://localhost:9000/blog";

const ALLOWED = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_BYTES = 10 * 1024 * 1024;
const MAX_WIDTH = 1600;

/** Resolve a stored image object key to a browser-loadable absolute URL. */
export function imageSrc(key: string): string {
  return `${PUBLIC_BASE}/${key}`;
}

/** Throw ApiClientError('INVALID_UPLOAD') if the file is the wrong type or too big. */
export function validateImageFile(file: File): void {
  if (!ALLOWED.has(file.type)) {
    throw new ApiClientError("INVALID_UPLOAD", "图片格式不支持（仅 JPG/PNG/WebP）");
  }
  if (file.size > MAX_BYTES) {
    throw new ApiClientError("INVALID_UPLOAD", "图片不能超过 10MB");
  }
}

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("无法读取图片"));
    };
    img.src = url;
  });
}

/** Re-encode to webp, preserving aspect ratio; downscale to MAX_WIDTH if wider. */
export async function fileToWebp(file: File): Promise<Blob> {
  const img = await loadImage(file);
  const scale = img.width > MAX_WIDTH ? MAX_WIDTH / img.width : 1;
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(img.width * scale);
  canvas.height = Math.round(img.height * scale);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("浏览器不支持 canvas");
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/webp", 0.9),
  );
  if (!blob) throw new Error("图片转换失败");
  return blob;
}

/** Full flow: validate -> presign -> webp -> PUT -> confirm. Returns absolute URL. */
export async function uploadImage(file: File): Promise<string> {
  validateImageFile(file);
  const { url, key } = await api<{ url: string; key: string }>(
    "/me/images/presign",
    { method: "POST" },
  );
  const webp = await fileToWebp(file);
  // Raw fetch (not api()): a presigned URL must NOT carry cookies, and its
  // signature requires exactly Content-Type: image/webp.
  const put = await fetch(url, {
    method: "PUT",
    body: webp,
    headers: { "Content-Type": "image/webp" },
  });
  if (!put.ok) {
    throw new ApiClientError("INVALID_UPLOAD", "上传失败，请重试");
  }
  const confirmed = await api<{ key: string }>("/me/images/confirm", {
    method: "POST",
    body: JSON.stringify({ key }),
  });
  return imageSrc(confirmed.key);
}
