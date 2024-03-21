import ejs, { Options } from 'ejs';
import roleSetupMd from './templates/roleSetup.md';
import deployingCommentMd from './templates/deployingComment.md';
import deployedCommentMd from './templates/deployedComment.md';

const ejsOptions: Options = { openDelimiter: '{', closeDelimiter: '}' };

export const roleSetupInstructions = async (
  owner: string,
  repo: string,
  logsUrl: string,
): Promise<string> => {
  return ejs.render(roleSetupMd, { owner, repo, logsUrl }, ejsOptions);
};

export const deployingMarkdown = async (commitSha: string, stage: string) => {
  return ejs.render(deployingCommentMd, { commitSha, stage }, ejsOptions);
};

export const deployedMarkdown = async (commitSha: string, stage: string, httpApiUrl?: string) => {
  return ejs.render(deployedCommentMd, { commitSha, stage, httpApiUrl }, ejsOptions);
};
