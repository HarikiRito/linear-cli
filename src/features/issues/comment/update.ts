import { ResultAsync } from 'neverthrow';
import { getClientWithAuthRetry } from '../../../lib/client/index.js';
import { mapLinearError } from '../../../lib/errors.js';
import { exitError } from '../../../lib/runner.js';
import { readStdin } from '../../../lib/stdin.js';
import { embedMarkdown, uploadFile } from '../../../lib/upload.js';
import { buildCommentResult, type CommentResult, renderComment } from './render.js';

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

  // Upload file if --file provided
  if (opts.file) {
    const uploadResult = await uploadFile(client, opts.file);
    if (uploadResult.isErr()) {
      exitError(uploadResult.error);
      return;
    }
    const md = embedMarkdown(uploadResult.value);
    body = body ? `${body}\n\n${md}` : md;
  }

  const result = await ResultAsync.fromPromise(
    client.updateComment(opts.id, { body }).then(buildCommentResult),
    (e) => mapLinearError(e)
  );

  result.match(
    (comment: CommentResult) => renderComment(comment, opts.plain),
    (e) => exitError(e)
  );
}
