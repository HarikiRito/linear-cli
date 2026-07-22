import { ResultAsync } from 'neverthrow';
import pc from 'picocolors';
import { getClientWithAuthRetry } from '../../../lib/client/index.js';
import { mapLinearError } from '../../../lib/errors.js';
import { exitError } from '../../../lib/runner.js';
import { readStdin } from '../../../lib/stdin.js';
import { attachIfNonImage, type FileAttachResult, uploadAndClassify } from '../../../lib/upload.js';
import { type CommentResult, renderComment, toCommentResult } from './render.js';

export interface UpdateCommentOptions {
  apiKey?: string;
  token?: string;
  id: string;
  body: string;
  plain: boolean;
  file?: string;
}

export async function updateComment(opts: UpdateCommentOptions): Promise<void> {
  let body = opts.body === '-' ? await readStdin() : opts.body;

  const clientResult = await getClientWithAuthRetry({ apiKey: opts.apiKey, token: opts.token });
  if (clientResult.isErr()) {
    exitError(clientResult.error);
    return;
  }
  const client = clientResult.value;

  // Upload file if --file provided. Images embed inline in the comment body;
  // everything else is registered as a resource-tab attachment (below), and
  // the body is left untouched. issueId isn't known until after updateComment
  // (via comment.issue below), so the upload can't run concurrently with the
  // mutation here — it must complete first regardless of file type.
  let fileOutcome: FileAttachResult | undefined;
  if (opts.file) {
    const outcomeResult = await uploadAndClassify(client, opts.file);
    if (outcomeResult.isErr()) {
      exitError(outcomeResult.error);
      return;
    }
    fileOutcome = outcomeResult.value;
    if (fileOutcome.isImage) {
      body = body ? `${body}\n\n${fileOutcome.embedMarkdown}` : fileOutcome.embedMarkdown;
    }
  }

  const payloadResult = await ResultAsync.fromPromise(
    client.updateComment(opts.id, { body }),
    (e) => mapLinearError(e)
  );
  if (payloadResult.isErr()) {
    exitError(payloadResult.error);
    return;
  }

  const comment = await payloadResult.value.comment;
  if (!comment) {
    exitError(mapLinearError(new Error('comment payload returned no comment')));
    return;
  }

  const commentResult: CommentResult = await toCommentResult(comment);
  renderComment(commentResult, opts.plain);

  // Best-effort: register a non-image upload as a real attachment on the
  // resource tab. The comment already updated successfully, so a failure here
  // is a warning, not a hard error. Images were already embedded inline above.
  if (fileOutcome && !fileOutcome.isImage) {
    const issue = await comment.issue;
    const issueId = issue?.id;
    if (!issueId) {
      console.error(
        pc.yellow('Warning: could not resolve issue for comment; skipping attachment registration.')
      );
    } else {
      await attachIfNonImage(client, issueId, fileOutcome);
    }
  }
}
