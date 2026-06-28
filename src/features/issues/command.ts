import type { Command } from 'commander';
import { registerArchiveCommand, registerUnarchiveCommand } from './archive/command.js';
import { registerBatchUpdateCommand } from './batch-update/command.js';
import { registerBranchCommand } from './branch/command.js';
import { registerCommentCommand } from './comment/command.js';
import { registerCopyCommand } from './copy/command.js';
import { registerCreateCommand } from './create/command.js';
import { registerDeleteCommand } from './delete/command.js';
import { registerFavoriteCommand, registerUnfavoriteCommand } from './favorite/command.js';
import { registerGetCommand } from './get/command.js';
import { registerHistoryCommand } from './history/command.js';
import { registerLinkCommand, registerUnlinkCommand } from './link/command.js';
import { registerListCommand } from './list/command.js';
import { registerMarkCommand } from './mark/command.js';
import { registerMeCommand } from './me/command.js';
import { registerQueryCommand } from './query/command.js';
import { registerRelationsCommand } from './relations/command.js';
import { registerRemindCommand } from './remind/command.js';
import { registerSubscribeCommand, registerUnsubscribeCommand } from './subscribe/command.js';
import { registerUnmarkCommand } from './unmark/command.js';
import { registerUpdateCommand } from './update/command.js';

export function registerIssues(program: Command): void {
  const issues = program
    .command('issues')
    .description(
      'Issue commands: list, get, me, query, create, update, batch-update, delete, comment, mark, unmark, relations, link, unlink, favorite, unfavorite, subscribe, unsubscribe, archive, unarchive, remind, copy, history'
    )
    .addHelpCommand(false);

  // Bare `issues` with no subcommand prints help
  issues.action(() => {
    issues.help();
  });

  registerListCommand(issues);
  registerGetCommand(issues);
  registerMeCommand(issues);
  registerQueryCommand(issues);
  registerCommentCommand(issues);
  registerCreateCommand(issues);
  registerUpdateCommand(issues);
  registerBatchUpdateCommand(issues);
  registerDeleteCommand(issues);
  registerBranchCommand(issues);
  registerMarkCommand(issues);
  registerUnmarkCommand(issues);
  registerRelationsCommand(issues);
  registerLinkCommand(issues);
  registerUnlinkCommand(issues);
  registerFavoriteCommand(issues);
  registerUnfavoriteCommand(issues);
  registerSubscribeCommand(issues);
  registerUnsubscribeCommand(issues);
  registerArchiveCommand(issues);
  registerUnarchiveCommand(issues);
  registerRemindCommand(issues);
  registerCopyCommand(issues);
  registerHistoryCommand(issues);
}
