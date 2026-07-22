import { existsSync, readFileSync } from 'node:fs';
import { basename, extname } from 'node:path';
import type { LinearClient } from '@linear/sdk';
import { err, ok, type Result, ResultAsync } from 'neverthrow';
import { coerceCliError } from './errors.js';

const IMAGE_EXTENSIONS = /^\.(png|jpg|jpeg|gif|webp|svg)$/i;

const MIME_MAP: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.pdf': 'application/pdf',
  '.txt': 'text/plain',
  '.md': 'text/markdown',
  '.json': 'application/json',
  '.csv': 'text/csv',
  '.zip': 'application/zip',
  '.gz': 'application/gzip',
  '.tar': 'application/x-tar',
  '.mp4': 'video/mp4',
  '.mp3': 'audio/mpeg',
  '.doc': 'application/msword',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.xls': 'application/vnd.ms-excel',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'application/javascript',
  '.ts': 'application/typescript',
};

export function detectMimeType(filename: string): string {
  const ext = extname(filename).toLowerCase();
  return MIME_MAP[ext] ?? 'application/octet-stream';
}

export class UploadError extends Error {
  readonly kind = 'UploadError' as const;
  constructor(message: string) {
    super(message);
    this.name = 'UploadError';
  }
}

export interface UploadResult {
  assetUrl: string;
  uploadUrl: string;
  filename: string;
}

/**
 * Build a markdown snippet from an uploaded file result.
 * Images render as `![filename](url)`, everything else as `[filename](url)`.
 */
export function embedMarkdown(result: UploadResult): string {
  const { assetUrl, filename } = result;
  const ext = extname(filename);
  const isImage = IMAGE_EXTENSIONS.test(ext);
  return isImage ? `![${filename}](${assetUrl})` : `[${filename}](${assetUrl})`;
}

/**
 * Upload a local file via Linear's two-step flow:
 * 1. Request a pre-signed upload slot via `fileUpload` mutation
 * 2. PUT raw file bytes to the returned `uploadUrl`
 * Returns the `assetUrl` on success.
 */
export async function uploadFile(
  client: LinearClient,
  filePath: string
): Promise<Result<UploadResult, Error>> {
  if (!existsSync(filePath)) {
    return err(new Error(`File not found: ${filePath}`));
  }

  const filename = basename(filePath);
  const contentType = detectMimeType(filename);
  const buffer = readFileSync(filePath);
  const size = buffer.length;

  const uploadResult = await ResultAsync.fromPromise(
    client.fileUpload(contentType, filename, size),
    coerceCliError
  );

  if (uploadResult.isErr()) {
    return err(uploadResult.error);
  }

  const uploadFile = uploadResult.value.uploadFile;
  if (!uploadFile) {
    return err(new Error('fileUpload returned no upload file details'));
  }

  const { uploadUrl, assetUrl, headers } = uploadFile;

  // PUT raw bytes to pre-signed URL with required headers
  const putHeaders: Record<string, string> = {
    'Content-Type': contentType,
  };
  if (headers) {
    for (const h of headers) {
      putHeaders[h.key] = h.value;
    }
  }

  const putResponse = await fetch(uploadUrl, {
    method: 'PUT',
    headers: putHeaders,
    body: buffer,
  });

  if (!putResponse.ok) {
    const statusText = putResponse.statusText || `HTTP ${putResponse.status}`;
    return err(
      new UploadError(`File upload to storage failed (${putResponse.status}): ${statusText}`)
    );
  }

  return ok({ assetUrl, uploadUrl, filename });
}
