import { type Result, ResultAsync } from 'neverthrow';
import pc from 'picocolors';
import { getClientWithAuthRetry } from '../../../lib/client/index.js';
import { exitError } from '../../../lib/runner.js';
import { readStdin } from '../../../lib/stdin.js';
import {
  attachIfNonImage,
  type FileAttachResult,
  isImageFile,
  uploadAndClassify,
} from '../../../lib/upload.js';
import { mapIssueNotFoundError, resolveIssueIdentifier } from '../shared/resolve.js';
import { buildCommentResult, type CommentResult, renderComment } from './render.js';

export interface AddCommentOptions {
  apiKey?: string;
  token?: string;
  issueId: string;
  body: string;
  plain: boolean;
  file?: string;
}

export async function addComment(opts: AddCommentOptions): Promise<void> {
  let body = opts.body === '-' ? await readStdin() : opts.body;

  const clientResult = await getClientWithAuthRetry({ apiKey: opts.apiKey, token: opts.token });
  if (clientResult.isErr()) {
    exitError(clientResult.error);
    return;
  }
  const client = clientResult.value;

  // Resolve bare issue numbers (e.g. "153") via the default team, same as other
  // issue commands (get/update) — see H-163. Full identifiers/UUIDs pass through.
  const idResult = await resolveIssueIdentifier(opts.issueId, client);
  if (idResult.isErr()) {
    exitError(idResult.error);
    return;
  }
  const issueId = idResult.value;

  // Upload file if --file provided. Images embed inline in the comment body;
  // everything else is registered as a resource-tab attachment (below), and
  // the body is left untouched.
  let fileOutcome: FileAttachResult | undefined;
  let pendingUpload: Promise<Result<FileAttachResult, Error>> | undefined;
  if (opts.file) {
    if (isImageFile(opts.file)) {
      // Sequential: the embed markdown must land in the body before createComment runs.
      const outcomeResult = await uploadAndClassify(client, opts.file);
      if (outcomeResult.isErr()) {
        exitError(outcomeResult.error);
        return;
      }
      fileOutcome = outcomeResult.value;
      body = body ? `${body}\n\n${fileOutcome.embedMarkdown}` : fileOutcome.embedMarkdown;
    } else {
      // Non-image: doesn't affect the comment body, so upload it concurrently
      // with createComment below instead of blocking on it first.
      pendingUpload = uploadAndClassify(client, opts.file);
    }
  }

  const commentPromise = ResultAsync.fromPromise(
    client.createComment({ issueId, body }).then(buildCommentResult),
    (e) => mapIssueNotFoundError(e, issueId)
  );

  const [result, uploadOutcome] = pendingUpload
    ? await Promise.all([commentPromise, pendingUpload])
    : [await commentPromise, undefined];

  if (result.isErr()) {
    exitError(result.error);
    return;
  }
  const comment: CommentResult = result.value;
  renderComment(comment, opts.plain);

  if (uploadOutcome) {
    // The comment already posted successfully by the time the concurrent
    // upload settles, so an upload failure here is a warning, not a hard error.
    if (uploadOutcome.isErr()) {
      console.error(pc.yellow(`Warning: file upload failed: ${uploadOutcome.error.message}`));
    } else {
      fileOutcome = uploadOutcome.value;
    }
  }

  // Best-effort: register a non-image upload as a real attachment on the
  // resource tab. Images were already embedded inline above.
  await attachIfNonImage(client, issueId, fileOutcome);
}
