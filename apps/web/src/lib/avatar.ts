import type { AuthUser } from "@blog/shared";
import { api, ApiClientError } from "./api";

const PUBLIC_BASE =
  process.env.NEXT_PUBLIC_S3_PUBLIC_URL ?? "http://localhost:9000/blog";

const ALLOWED = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_BYTES = 2 * 1024 * 1024;

/** Resolve a stored avatar object key to a browser-loadable URL. */
export function avatarSrc(key: string): string {
  return `${PUBLIC_BASE}/${key}`;
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

/** Cover-crop to a centered square and encode as webp. */
export async function fileToWebp(file: File, size = 256): Promise<Blob> {
  const img = await loadImage(file);
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("浏览器不支持 canvas");
  const side = Math.min(img.width, img.height);
  const sx = (img.width - side) / 2;
  const sy = (img.height - side) / 2;
  ctx.drawImage(img, sx, sy, side, side, 0, 0, size, size);
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/webp", 0.9),
  );
  if (!blob) throw new Error("图片转换失败");
  return blob;
}

/** Full upload flow: presign -> convert to webp -> PUT -> confirm. Returns updated AuthUser. */
export async function uploadAvatar(file: File): Promise<AuthUser> {
  if (!ALLOWED.has(file.type)) {
    throw new ApiClientError("INVALID_UPLOAD", "图片格式不支持");
  }
  if (file.size > MAX_BYTES) {
    throw new ApiClientError("INVALID_UPLOAD", "图片不能超过 2MB");
  }
  const { url, key } = await api<{ url: string; key: string }>(
    "/me/avatar/presign",
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
  return api<AuthUser>("/me/avatar/confirm", {
    method: "POST",
    body: JSON.stringify({ key }),
  });
}
