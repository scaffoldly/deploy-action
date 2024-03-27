import ejs, { Options } from 'ejs';
import roleSetupMd from './templates/roleSetup.md';
import preparingCommentMd from './templates/preparingComment.md';
import deployingCommentMd from './templates/deployingComment.md';
import deployedCommentMd from './templates/deployedComment.md';
import destroyedCommentMd from './templates/destroyedComment.md';
import failedCommentMd from './templates/failedComment.md';

const ejsOptions: Options = { openDelimiter: '{', closeDelimiter: '}' };

export type Message = {
  longMessage: string;
  shortMessage: string;
};

export const roleSetupMoreInfo = async (
  owner: string,
  repo: string,
  logsUrl: string,
): Promise<string> => {
  return ejs.render(roleSetupMd, { owner, repo, logsUrl }, ejsOptions);
};

export const preparingMarkdown = async (commitSha: string, stage: string): Promise<Message> => {
  const long = await ejs.render(preparingCommentMd, { commitSha, stage }, ejsOptions);
  const short = `Preparing ${stage} for deployment...`;
  return { longMessage: long, shortMessage: short };
};

export const deployingMarkdown = async (
  commitSha: string,
  stage: string,
  logsUrl?: string,
): Promise<Message> => {
  const long = await ejs.render(deployingCommentMd, { commitSha, stage, logsUrl }, ejsOptions);
  const short = `Deploying ${stage}...`;
  return { longMessage: long, shortMessage: short };
};

export const deployedMarkdown = async (
  commitSha: string,
  stage: string,
  httpApiUrl?: string,
  logsUrl?: string,
  deployLog?: string,
): Promise<Message> => {
  const long = await ejs.render(
    deployedCommentMd,
    { commitSha, stage, httpApiUrl, logsUrl, deployLog },
    ejsOptions,
  );
  const short = `Deployed ${stage} to ${httpApiUrl}`;
  return { longMessage: long, shortMessage: short };
};

export const destroyedMarkdown = async (
  commitSha: string,
  stage: string,
  logsUrl?: string,
  deployLog?: string,
): Promise<Message> => {
  const long = await ejs.render(
    destroyedCommentMd,
    { commitSha, stage, logsUrl, deployLog },
    ejsOptions,
  );
  const short = `Stage ${stage} has been deleted.`;
  return { longMessage: long, shortMessage: short };
};

export const failedMarkdown = async (
  commitSha: string,
  stage: string,
  logsUrl?: string,
  deployLog?: string,
  moreInfo?: string,
): Promise<Message> => {
  const long = await ejs.render(
    failedCommentMd,
    { commitSha, stage, logsUrl, moreInfo, deployLog },
    ejsOptions,
  );
  const short = `Stage ${stage} failed to deploy.`;
  return { longMessage: long, shortMessage: short };
};
