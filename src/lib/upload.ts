import { existsSync, readFileSync } from 'node:fs';
import { basename, extname } from 'node:path';
import type { LinearClient } from '@linear/sdk';
import { err, ok, type Result, ResultAsync } from 'neverthrow';
import pc from 'picocolors';
import { type CliError, coerceCliError } from './errors.js';

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
 * Whether a filename's extension is one of the recognized image types.
 * Shared by `embedMarkdown` (rendering) and callers deciding whether to embed
 * inline vs. register a resource-tab attachment.
 */
export function isImageFile(filename: string): boolean {
  return IMAGE_EXTENSIONS.test(extname(filename));
}

/**
 * Build a markdown snippet from an uploaded file result.
 * Images render as `![filename](url)`, everything else as `[filename](url)`.
 */
export function embedMarkdown(result: UploadResult): string {
  const { assetUrl, filename } = result;
  return isImageFile(filename) ? `![${filename}](${assetUrl})` : `[${filename}](${assetUrl})`;
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

/**
 * Register an uploaded asset as a real Linear issue attachment via the
 * `createAttachment` mutation. Returns the new attachment's ID on success.
 */
export function createAttachmentRecord(
  client: LinearClient,
  issueId: string,
  title: string,
  url: string
): ResultAsync<string, CliError> {
  return ResultAsync.fromPromise(
    client
      .createAttachment({ issueId, title, url })
      .then(async (payload) => {
        const attachment = await payload.attachment;
        if (!attachment) throw new Error('attachment payload returned no attachment');
        return attachment.id;
      }),
    coerceCliError
  );
}

/**
 * Result of uploading a local file (`--file`) and classifying it as an inline
 * image embed vs. a resource-tab attachment. Shared by every command that
 * accepts `--file` (comment add/update, issue create/update) to dedupe the
 * upload → classify → embed sequence.
 */
export interface FileAttachResult {
  uploaded: UploadResult;
  isImage: boolean;
  /** Markdown to append to the body/description; empty string for non-image (attachment-only) files. */
  embedMarkdown: string;
}

/**
 * Upload a local file and classify it. Does not need an issueId — pair this
 * with `attachIfNonImage` once the issue/comment the file belongs to exists.
 * Callers append `.embedMarkdown` into the body/description themselves when
 * `isImage` is true (needed BEFORE the create/update mutation runs, since it
 * must land in the mutation's input).
 */
export async function uploadAndClassify(
  client: LinearClient,
  filePath: string
): Promise<Result<FileAttachResult, Error>> {
  const uploadResult = await uploadFile(client, filePath);
  if (uploadResult.isErr()) return err(uploadResult.error);
  const uploaded = uploadResult.value;
  const isImage = isImageFile(uploaded.filename);
  return ok({ uploaded, isImage, embedMarkdown: isImage ? embedMarkdown(uploaded) : '' });
}

/**
 * Best-effort: register a non-image upload as a real attachment on the
 * issue's resource tab. No-op if `result` is undefined or was an image
 * (already embedded inline by the caller). The primary mutation (comment/issue
 * create or update) has already succeeded by the time this runs, so a
 * failure here is only ever logged as a warning, never thrown.
 */
export async function attachIfNonImage(
  client: LinearClient,
  issueId: string,
  result: FileAttachResult | undefined
): Promise<void> {
  if (!result || result.isImage) return;
  const attachResult = await createAttachmentRecord(
    client,
    issueId,
    result.uploaded.filename,
    result.uploaded.assetUrl
  );
  attachResult.match(
    () => {},
    (e) => console.error(pc.yellow(`Warning: could not register file attachment: ${e.message}`))
  );
}
