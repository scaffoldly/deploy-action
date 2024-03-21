import { debug, getIDToken, exportVariable, info } from '@actions/core';
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
import { deployedMarkdown, deployingMarkdown, roleSetupInstructions } from './messages';
import { boolean } from 'boolean';
import { RunState } from './main';
import { PreState } from './pre';
import { PostState } from './post';

const { GITHUB_REPOSITORY, GITHUB_REF, GITHUB_BASE_REF, GITHUB_RUN_ATTEMPT, GITHUB_EVENT_NAME } =
  process.env;

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
  async pre(): Promise<PreState> {
    let deploy = false;
    let destroy = false;
    if (
      (GITHUB_EVENT_NAME === 'pull_request' && context.payload.action === 'closed') ||
      (GITHUB_EVENT_NAME === 'workflow_dispatch' &&
        boolean(context.payload.inputs.destroy) === true)
    ) {
      deploy = false;
      destroy = true;
    } else {
      deploy = true;
      destroy = false;
    }

    const deploymentId = await this.createDeployment();
    const { commentId, message } = await this.createDeployingComment(destroy);

    return {
      deploy,
      destroy,
      stage: this.stage,
      deploymentId,
      commentId,
      summaryMessage: message,
    };
  }

  async run(state: PreState): Promise<RunState> {
    debug(`state: ${JSON.stringify(state)}`);

    await this.updateDeployment(state, 'in_progress');

    const region = getInput('region') || 'us-east-1';
    const role = getInput('role');

    const idToken = await this.idToken;

    try {
      let client = new STSClient({ region });
      const assumeResponse = await client.send(
        new AssumeRoleWithWebIdentityCommand({
          WebIdentityToken: idToken,
          RoleArn: role,
          RoleSessionName: `${this.owner}-${this.repo}-${context.runNumber}-${context.runId}`,
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
      return {
        ...state,
        deploy: false,
        destroy: false,
        summaryMessage: await roleSetupInstructions(this.owner, this.repo, await this.logsUrl),
        failureMessage: e.message,
      };
    }

    return {
      ...state,
    };
  }

  get logsUrl(): Promise<string> {
    return new Promise(async (resolve, reject) => {
      const { runId, job: jobName } = context;
      let logsUrl = `https://github.com/${this.owner}/${this.repo}/actions/runs/${runId}`;

      try {
        const octokit = getOctokit(this.token);

        const jobs = await octokit.rest.actions.listJobsForWorkflowRun({
          owner: this.owner,
          repo: this.repo,
          run_id: runId,
        });

        const job = jobs.data.jobs.find(
          (j) => j.name === jobName && j.run_attempt === parseInt(GITHUB_RUN_ATTEMPT || '1', 10),
        );

        if (job && job.html_url) {
          resolve(job.html_url);
          return;
        }
      } catch (e) {
        if (!(e instanceof Error)) {
          reject(e);
          return;
        }
        warn(`Unable to infer logs URL: ${e.message}`);
      }
      resolve(logsUrl);
    });
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
      deploymentStage = `${GITHUB_BASE_REF.replaceAll('/', '-')}-pr-${branchId}`;
    }

    return deploymentStage;
  }

  get owner(): string {
    const [owner] = GITHUB_REPOSITORY?.split('/') || [];
    if (!owner) {
      throw new Error('Unable to determine owner from GITHUB_REPOSITORY');
    }
    return owner;
  }

  get repo(): string {
    const [, repo] = GITHUB_REPOSITORY?.split('/') || [];
    if (!repo) {
      throw new Error('Unable to determine repo from GITHUB_REPOSITORY');
    }
    return repo;
  }

  get token(): string {
    const token = getInput('token');
    if (!token) {
      throw new Error('Missing GITHUB_TOKEN');
    }
    return token;
  }

  get idToken(): Promise<string> {
    return new Promise(async (resolve) => {
      const idToken = await getIDToken('sts.amazonaws.com');
      if (!idToken) {
        throw new Error(
          'No ID Token found. Please ensure the `id-token: write` is enabled in the GitHub Action permissions.',
        );
      }
      resolve(idToken);
    });
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

  async createDeployment(): Promise<number | undefined> {
    const octokit = getOctokit(this.token);

    const response = await octokit.rest.repos.createDeployment({
      ref: context.ref,
      required_contexts: [],
      environment: this.stage,
      transient_environment: !!this.prNumber,
      auto_merge: false,
      owner: this.owner,
      repo: this.repo,
      task: context.job,
      payload: {},
      production_environment: this.stage === 'production',
    });

    if (typeof response.data === 'number') {
      return response.data;
    }

    if ('id' in response.data) {
      return response.data.id;
    }

    debug(`Response: ${JSON.stringify(response.data)}`);
    warn("Unable to create deployment, response didn't contain an ID.");

    return undefined;
  }

  async createDeployingComment(destroy: boolean): Promise<{ commentId?: number; message: string }> {
    const message = await deployingMarkdown(this.commitSha, this.stage);

    if (destroy) {
      debug('Destroying, not adding PR comment.');
      return { message };
    }

    const { prNumber } = this;
    if (!prNumber) {
      debug('No PR number found, can not add PR comment.');
      return { message };
    }

    const octokit = getOctokit(this.token);

    const response = await octokit.rest.issues.createComment({
      body: message,
      owner: this.owner,
      repo: this.repo,
      issue_number: prNumber,
    });

    return { commentId: response.data.id, message };
  }

  async updateDeployment(
    state: RunState,
    status: 'success' | 'failure' | 'inactive' | 'pending' | 'in_progress',
  ) {
    const { deploymentId } = state;
    if (!deploymentId) {
      debug('No deploymentId found, skipping deployment update.');
      return;
    }

    const octokit = getOctokit(this.token);
    debug(`Updating Deployment: ${deploymentId} with state: ${JSON.stringify(state)}`);

    await octokit.rest.repos.createDeploymentStatus({
      deployment_id: deploymentId,
      state: status,
      environment_url: await this.httpApiUrl,
      log_url: await this.logsUrl,
      environment: this.stage,
      owner: this.owner,
      repo: this.repo,
    });
  }

  async updateDeployedComment(
    state: RunState,
  ): Promise<{ httpApiUrl: string | undefined; message: string }> {
    let summaryMessage = state.summaryMessage;
    let httpApiUrl = await this.httpApiUrl;

    if (!summaryMessage) {
      debug('No summaryMessage found, generating deployment information message.');
      summaryMessage = await deployedMarkdown(this.commitSha, state.stage, httpApiUrl);
    }

    const { commentId } = state;

    if (!commentId) {
      // TODO: if comment ID is unknown, just use step summary
      debug('No commentId found, skipping PR Comment.');
      return { httpApiUrl, message: summaryMessage };
    }

    if (state.destroy) {
      debug('Destroying, skipping PR comment.');
      return { httpApiUrl, message: summaryMessage };
    }

    const { prNumber } = this;
    if (!prNumber) {
      debug('No PR number found, skipping PR comment.');
      return { httpApiUrl, message: summaryMessage };
    }

    const octokit = getOctokit(this.token);
    debug(
      `Updating PR Comment: ${prNumber} with commentId: ${commentId} and message: ${summaryMessage}`,
    );
    await octokit.rest.issues.updateComment({
      comment_id: commentId,
      body: summaryMessage,
      owner: this.owner,
      repo: this.repo,
      issue_number: prNumber,
    });

    return { httpApiUrl, message: summaryMessage };
  }

  async post(state: RunState): Promise<PostState> {
    debug(`state: ${JSON.stringify(state)}`);

    const { httpApiUrl, message } = await this.updateDeployedComment(state);

    const status = state.failureMessage ? 'failure' : 'success';
    await this.updateDeployment(state, status);

    return {
      ...state,
      httpApiUrl,
      summaryMessage: message,
    };
  }

  get serverlessState(): Promise<ServerlessState | undefined> {
    return new Promise(async (resolve) => {
      try {
        const serverlessState = JSON.parse(
          fs.readFileSync(path.join('.serverless', 'serverless-state.json'), 'utf8'),
        );

        resolve(serverlessState);
      } catch (e) {
        warn('No serverless state found.');
        debug(`Caught Error: ${e}`);
        resolve(undefined);
      }
    });
  }

  get stack(): Promise<Stack | undefined> {
    return new Promise(async (resolve) => {
      const serverlessState = await this.serverlessState;

      if (!serverlessState) {
        resolve(undefined);
        return;
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
        resolve(undefined);
        return;
      }

      resolve(stack);
    });
  }

  get httpApiUrl(): Promise<string | undefined> {
    return new Promise(async (resolve) => {
      const stack = await this.stack;

      if (!stack) {
        resolve(undefined);
        return;
      }

      resolve(stack.Outputs?.find((o) => o.OutputKey === 'HttpApiUrl')?.OutputValue);
    });
  }
}
