import { type Result, ResultAsync } from 'neverthrow';
import pc from 'picocolors';
import { getClientWithAuthRetry, getRequestFn } from '../../../lib/client/index.js';
import { coerceCliError, mapLinearError, NotFoundError } from '../../../lib/errors.js';
import { exitError } from '../../../lib/runner.js';
import { readStdin } from '../../../lib/stdin.js';
import {
  attachIfNonImage,
  type FileAttachResult,
  isImageFile,
  uploadAndClassify,
} from '../../../lib/upload.js';
import { COMMENT_ISSUE_ID_QUERY } from './queries.js';
import { buildCommentResult, renderComment } from './render.js';

export interface ReplyCommentOptions {
  apiKey?: string;
  token?: string;
  parentId: string;
  body: string;
  plain: boolean;
  file?: string;
}

export async function replyComment(opts: ReplyCommentOptions): Promise<void> {
  let body = opts.body === '-' ? await readStdin() : opts.body;

  const clientResult = await getClientWithAuthRetry({ apiKey: opts.apiKey, token: opts.token });
  if (clientResult.isErr()) {
    exitError(clientResult.error);
    return;
  }
  const client = clientResult.value;

  const requestFn = getRequestFn(client);

  // Fetch the parent comment's issueId in a single query — Linear requires issueId alongside parentId.
  const issueIdResult = await ResultAsync.fromPromise(
    requestFn(COMMENT_ISSUE_ID_QUERY, { id: opts.parentId }).then((data) => {
      const issueId = data.comment?.issueId;
      if (!issueId) throw new NotFoundError('comment', opts.parentId);
      return issueId;
    }),
    (e) => coerceCliError(e)
  );

  if (issueIdResult.isErr()) {
    exitError(issueIdResult.error);
    return;
  }
  const issueId = issueIdResult.value;

  // Same file semantics as `comment add`: images embed inline, everything else
  // becomes a resource-tab attachment and leaves the body untouched.
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
      // Non-image: doesn't affect the body, so upload it alongside createComment.
      pendingUpload = uploadAndClassify(client, opts.file);
    }
  }

  const commentPromise = ResultAsync.fromPromise(
    client.createComment({ issueId, parentId: opts.parentId, body }).then(buildCommentResult),
    (e) => mapLinearError(e)
  );

  const [result, uploadOutcome] = pendingUpload
    ? await Promise.all([commentPromise, pendingUpload])
    : [await commentPromise, undefined];

  if (result.isErr()) {
    exitError(result.error);
    return;
  }
  renderComment(result.value, opts.plain);

  if (uploadOutcome) {
    // The reply already posted by the time the concurrent upload settles, so an
    // upload failure here is a warning, not a hard error.
    if (uploadOutcome.isErr()) {
      console.error(pc.yellow(`Warning: file upload failed: ${uploadOutcome.error.message}`));
    } else {
      fileOutcome = uploadOutcome.value;
    }
  }

  // Best-effort: register a non-image upload as an attachment on the resource
  // tab. Images were already embedded inline above.
  await attachIfNonImage(client, issueId, fileOutcome);
}
