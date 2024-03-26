import ejs, { Options } from 'ejs';
import roleSetupMd from './templates/roleSetup.md';
import preparingCommentMd from './templates/preparingComment.md';
import deployingCommentMd from './templates/deployingComment.md';
import deployedCommentMd from './templates/deployedComment.md';

const ejsOptions: Options = { openDelimiter: '{', closeDelimiter: '}' };

export type Message = {
  longMessage: string;
  shortMessage: string;
};

export const roleSetupInstructions = async (
  owner: string,
  repo: string,
  logsUrl: string,
): Promise<Message> => {
  const long = await ejs.render(roleSetupMd, { owner, repo, logsUrl }, ejsOptions);
  const short = `Unable to Deploy to AWS`;
  return { longMessage: long, shortMessage: short };
};

export const preparingMarkdown = async (commitSha: string, stage: string): Promise<Message> => {
  const long = await ejs.render(preparingCommentMd, { commitSha, stage }, ejsOptions);
  const short = `Preparing ${stage} for deployment...`;
  return { longMessage: long, shortMessage: short };
};

export const deployingMarkdown = async (commitSha: string, stage: string): Promise<Message> => {
  const long = await ejs.render(deployingCommentMd, { commitSha, stage }, ejsOptions);
  const short = `Deploying ${stage}...`;
  return { longMessage: long, shortMessage: short };
};

export const deployedMarkdown = async (
  commitSha: string,
  stage: string,
  httpApiUrl?: string,
): Promise<Message> => {
  const long = await ejs.render(deployedCommentMd, { commitSha, stage, httpApiUrl }, ejsOptions);
  const short = `Deployed ${stage} to ${httpApiUrl}`;
  return { longMessage: long, shortMessage: short };
};
