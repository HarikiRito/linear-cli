import { ResultAsync } from 'neverthrow';
import { getClientWithAuthRetry } from '../../../lib/client/index.js';
import { coerceCliError, ValidationError } from '../../../lib/errors.js';
import { exitError } from '../../../lib/runner.js';
import { resolveIssueIdentifier } from '../shared/resolve.js';

export const SUPPORTED_FORMATS =
  'ISO datetime (2026-07-01T09:00:00), date only (2026-07-01), tomorrow, or "tomorrow HH:MM"';

/**
 * Parse a <when> argument to a Date object.
 * Supported formats:
 * - ISO 8601 datetime: 2026-07-01T09:00:00
 * - Date only: 2026-07-01 (interpreted as midnight UTC)
 * - "tomorrow" (midnight UTC next calendar day)
 * - "tomorrow HH:MM" (that time on the next calendar day, local time)
 */
export function parseWhen(when: string): Date | null {
  const normalized = when.trim().toLowerCase();

  // "tomorrow" shorthand
  if (normalized === 'tomorrow') {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    d.setHours(0, 0, 0, 0);
    return d;
  }

  // "tomorrow HH:MM"
  const tomorrowTimeMatch = /^tomorrow\s+(\d{1,2}):(\d{2})$/.exec(normalized);
  if (tomorrowTimeMatch) {
    const hours = parseInt(tomorrowTimeMatch[1], 10);
    const minutes = parseInt(tomorrowTimeMatch[2], 10);
    if (hours >= 0 && hours <= 23 && minutes >= 0 && minutes <= 59) {
      const d = new Date();
      d.setDate(d.getDate() + 1);
      d.setHours(hours, minutes, 0, 0);
      return d;
    }
    return null;
  }

  // Date-only: YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(when)) {
    const d = new Date(`${when}T00:00:00.000Z`);
    return isNaN(d.getTime()) ? null : d;
  }

  // ISO 8601 datetime
  const d = new Date(when);
  return isNaN(d.getTime()) ? null : d;
}

export interface RemindOptions {
  apiKey?: string;
  token?: string;
  issue: string;
  when: string;
}

export async function remindIssue(opts: RemindOptions): Promise<void> {
  const reminderAt = parseWhen(opts.when);
  if (!reminderAt) {
    exitError(
      new ValidationError(
        `Cannot parse '${opts.when}' as a date/time. Supported formats: ${SUPPORTED_FORMATS}`
      )
    );
    return;
  }

  const clientResult = await getClientWithAuthRetry({ apiKey: opts.apiKey, token: opts.token });
  if (clientResult.isErr()) {
    exitError(clientResult.error);
    return;
  }
  const client = clientResult.value;

  const idResult = await resolveIssueIdentifier(opts.issue, client);
  if (idResult.isErr()) {
    exitError(idResult.error);
    return;
  }
  const resolvedId = idResult.value;

  const result = await ResultAsync.fromPromise(
    client.issueReminder(resolvedId, reminderAt),
    coerceCliError
  );

  result.match(
    () => {
      console.log(`Reminder set for ${opts.issue} at ${reminderAt.toISOString()}.`);
    },
    (e) => exitError(e)
  );
}
