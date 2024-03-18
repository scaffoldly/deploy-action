import {
  debug,
  notice,
  getIDToken,
  exportVariable,
  info,
  setOutput,
  saveState,
  getState,
} from '@actions/core';
import { getInput } from '@actions/core';
import { context, getOctokit } from '@actions/github';
import { warn } from 'console';
import fs from 'fs';
import path from 'path';
import { CloudFormationClient, DescribeStacksCommand, Stack } from '@aws-sdk/client-cloudformation';
import {
  STSClient,
  AssumeRoleWithWebIdentityCommand,
  GetCallerIdentityCommand,
} from '@aws-sdk/client-sts';
import { roleSetupInstructions } from './messages';
import { boolean } from 'boolean';

const { GITHUB_REPOSITORY, GITHUB_REF, GITHUB_BASE_REF } = process.env;

type ServerlessState = {
  service: {
    service: string;
    provider: {
      stage: string;
      region: string;
    };
  };
};

export class Action {
  async run(): Promise<void> {
    const region = getInput('region') || 'us-east-1';
    const role = getInput('role');
    const [owner, repo] = GITHUB_REPOSITORY?.split('/') || [];

    setOutput('stage', this.stage);

    let deploy = true;
    let destroy = false;
    if (
      (context.eventName === 'pull_request' && context.payload.action === 'closed') ||
      (context.eventName === 'workflow_dispatch' &&
        boolean(context.payload.inputs.destroy) === true)
    ) {
      deploy = false;
      destroy = true;
    }
    setOutput('deploy', deploy);
    saveState('destroy', destroy);
    setOutput('destroy', destroy);

    let idToken: string | undefined = undefined;

    try {
      idToken = await getIDToken('sts.amazonaws.com');
    } catch (e) {
      warn(
        'Unable to get ID Token. Please ensure the `id-token: write` is enabled in the GitHub Action permissions.',
      );
      debug(`Error: ${e}`);
    }

    if (!idToken) {
      warn('No ID Token found.');
      return;
    }

    try {
      let client = new STSClient({ region });
      const assumeResponse = await client.send(
        new AssumeRoleWithWebIdentityCommand({
          WebIdentityToken: idToken,
          RoleArn: role,
          RoleSessionName: `${owner}-${repo}-${context.runNumber}-${context.runId}`,
        }),
      );

      exportVariable('AWS_DEFAULT_REGION', region);
      exportVariable('AWS_ACCESS_KEY_ID', assumeResponse.Credentials?.AccessKeyId);
      exportVariable('AWS_SECRET_ACCESS_KEY', assumeResponse.Credentials?.SecretAccessKey);
      exportVariable('AWS_SESSION_TOKEN', assumeResponse.Credentials?.SessionToken);

      client = new STSClient({
        region,
        credentials: {
          accessKeyId: assumeResponse.Credentials!.AccessKeyId!,
          secretAccessKey: assumeResponse.Credentials!.SecretAccessKey!,
          sessionToken: assumeResponse.Credentials!.SessionToken!,
        },
      });

      const callerIdentity = await client.send(new GetCallerIdentityCommand({}));

      info(
        `Assumed ${role}: ${callerIdentity.Arn} (Credential expiration at ${assumeResponse.Credentials?.Expiration})`,
      );
    } catch (e) {
      if (!(e instanceof Error)) {
        throw e;
      }
      debug(`Error: ${e}`);
      throw new Error(`Unable to assume role: ${e.message}\n${roleSetupInstructions(owner, repo)}`);
    }
  }

  get stage(): string {
    const [, branchType, branchId] = GITHUB_REF?.split('/') || [];

    if (!branchId) {
      debug(`GITHUB_REF: ${GITHUB_REF}`);
      debug(`branchType: ${branchType}`);
      debug(`branchId: ${branchId}`);
      throw new Error('Unable to determine branch from GITHUB_REF');
    }

    let deploymentStage = branchId;
    if (branchType === 'pull') {
      if (!GITHUB_BASE_REF) {
        throw new Error('Unable to determine base ref from GITHUB_BASE_REF');
      }
      deploymentStage = `${GITHUB_BASE_REF}-pr-${branchId}`;
    }

    return deploymentStage;
  }

  get token(): string {
    const token = getInput('token');
    if (!token) {
      throw new Error('Missing GITHUB_TOKEN');
    }
    return token;
  }

  get commitSha(): string {
    if (context.eventName === 'pull_request') {
      return `${context.payload.pull_request?.head.sha}`.substring(0, 7);
    }
    return context.sha.substring(0, 7);
  }

  get prNumber(): number | undefined {
    if (context.eventName === 'pull_request') {
      return context.payload.pull_request?.number;
    }
    return undefined;
  }

  async addPrComments(): Promise<void> {
    const destroy = boolean(getState('destroy'));
    if (destroy) {
      debug('Destroying, not adding PR comment.');
      return;
    }

    const { prNumber } = this;
    if (!prNumber) {
      debug('No PR number found, can not add PR comment.');
      return;
    }

    const httpApiUrl = (await this.httpApiUrl) || 'Unknown';
    if (!httpApiUrl) {
      debug("No HTTP API URL found, can't add PR comment.");
      return;
    }

    const octokit = getOctokit(this.token);
    await octokit.rest.issues.createComment({
      body: `
\`${this.commitSha}\` has been deployed!
 - **Stage:** \`${this.stage}\`
 - **URL:** [${httpApiUrl}](${httpApiUrl})
`,
      owner: context.repo.owner,
      repo: context.repo.repo,
      issue_number: prNumber,
    });
  }

  async post(): Promise<void> {
    const httpApiUrl = await this.httpApiUrl;

    await this.addPrComments();
    notice(`HTTP API URL: ${httpApiUrl}`);
  }

  get serverlessState(): Promise<ServerlessState | undefined> {
    return new Promise(async (resolve) => {
      try {
        const serverlessState = JSON.parse(
          fs.readFileSync(path.join('.serverless', 'serverless-state.json'), 'utf8'),
        );

        return resolve(serverlessState);
      } catch (e) {
        warn('No serverless state found.');
        debug(`Error: ${e}`);
        return;
      }
    });
  }

  get stack(): Promise<Stack | undefined> {
    return new Promise(async (resolve) => {
      const serverlessState = await this.serverlessState;

      if (!serverlessState) {
        return resolve(undefined);
      }

      const stackName = `${serverlessState.service.service}-${serverlessState.service.provider.stage}`;

      const client = new CloudFormationClient({ region: serverlessState.service.provider.region });

      const describeStacks = await client.send(new DescribeStacksCommand({ StackName: stackName }));

      const stack = describeStacks.Stacks?.find(
        (s) =>
          s.StackName === stackName &&
          s.Tags?.find(
            (t) => t.Key === 'STAGE' && t.Value === serverlessState.service.provider.stage,
          ),
      );

      if (!stack) {
        warn('Unable to find stack.');
        debug(JSON.stringify(describeStacks));
        return resolve(undefined);
      }

      return resolve(stack);
    });
  }

  get httpApiUrl(): Promise<string | undefined> {
    return new Promise(async (resolve) => {
      const stack = await this.stack;

      if (!stack) {
        return resolve(undefined);
      }

      return resolve(stack.Outputs?.find((o) => o.OutputKey === 'HttpApiUrl')?.OutputValue);
    });
  }
}
