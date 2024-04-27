import { debug, getIDToken, exportVariable, notice, error } from '@actions/core';
import * as core from '@actions/core';
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
import {
  deployedMarkdown,
  deployingMarkdown,
  destroyedMarkdown,
  destroyingMarkdown,
  failedMarkdown,
  preparingMarkdown,
  roleSetupMoreInfo,
} from './messages';
import { boolean } from 'boolean';
import { exec } from './exec';

const {
  GITHUB_REPOSITORY,
  GITHUB_REF,
  GITHUB_BASE_REF,
  GITHUB_HEAD_REF,
  GITHUB_RUN_ATTEMPT,
  GITHUB_EVENT_NAME,
} = process.env;

type ServerlessState = {
  service: {
    service: string;
    provider: {
      stage: string;
      region: string;
    };
  };
};

export type State = {
  action?: 'deploy' | 'destroy';
  stage?: string;
  httpApiUrl?: string;
  deploymentId?: number;
  commentId?: number;
  failed?: boolean;
  shortMessage?: string;
  longMessage?: string;
};

export class Action {
  async pre(state: State): Promise<State> {
    state.stage = this.stage;

    if (boolean(getInput('destroy') || 'false') === true) {
      notice(`Destruction enabled. Destroying ${this.stage}...`);
      state.action = 'destroy';
    } else if (GITHUB_EVENT_NAME === 'pull_request' && context.payload.action === 'closed') {
      notice(`Pull request has been closed. Destroying ${this.stage}...`);
      state.action = 'destroy';
    } else if (
      GITHUB_EVENT_NAME === 'workflow_dispatch' &&
      boolean(this.workflowInputs.destroy) === true
    ) {
      notice(`Workflow dispatch triggered with destruction enabled. Destroying ${this.stage}...`);
      state.action = 'destroy';
    } else {
      state.action = 'deploy';
    }

    const region = getInput('region') || 'us-east-1';
    const role = getInput('role');

    const idToken = await this.idToken;
    const logsUrl = await this.logsUrl;

    const { shortMessage, longMessage } = await preparingMarkdown(
      this.commitSha,
      this.stage,
      logsUrl,
    );
    state.shortMessage = shortMessage;
    state.longMessage = longMessage;

    state = await this.createDeployment(state);

    try {
      if (!role || !role.trim()) {
        throw new Error(
          `Unknown or missing role. Please make sure DEPLOYMENT_ROLE is set in GitHub Actions Variables.`,
        );
      }

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

      notice(`Deploying as ${callerIdentity.Arn} using ${role}...`);
    } catch (e) {
      if (!(e instanceof Error)) {
        throw e;
      }

      error(e);

      const longMessage = await roleSetupMoreInfo(this.owner, this.repo, await this.logsUrl);

      return {
        ...state,
        action: undefined,
        failed: true,
        shortMessage: e.message,
        longMessage,
      };
    }

    return state;
  }

  async run(state: State): Promise<State> {
    debug(`state: ${JSON.stringify(state)}`);

    if (state.failed) {
      debug('state: ' + JSON.stringify(state));
      notice(`Deployment skipped due to failure...`);
      return state;
    }

    const logsUrl = await this.logsUrl;

    if (state.action === 'deploy') {
      let { shortMessage, longMessage } = await deployingMarkdown(
        this.commitSha,
        this.stage,
        logsUrl,
      );
      state.shortMessage = shortMessage;
      state.longMessage = longMessage;
    }

    if (state.action === 'destroy') {
      let { shortMessage, longMessage } = await destroyingMarkdown(
        this.commitSha,
        this.stage,
        logsUrl,
      );
      state.shortMessage = shortMessage;
      state.longMessage = longMessage;
    }

    await this.updateDeployment(state, 'in_progress');

    const cli = getInput('cli') || undefined;

    if (cli !== 'serverless') {
      throw new Error(`Unsupported with.cli option: ${cli}`);
    }
    // TODO: Add support for other CLI tools

    if (state.action === 'destroy') {
      notice(`Destroying ${this.stage}...`);
      await exec(['./node_modules/.bin/serverless', 'remove', '--verbose', '--stage', this.stage]);
    }

    if (state.action === 'deploy') {
      notice(`Deploying ${this.stage}...`);
      await exec(['./node_modules/.bin/serverless', 'deploy', '--verbose', '--stage', this.stage]);
    }

    return state;
  }

  async post(state: State): Promise<State> {
    debug(`state: ${JSON.stringify(state)}`);

    state.httpApiUrl = await this.httpApiUrl;
    const logsUrl = await this.logsUrl;

    if (!state.failed) {
      if (state.action === 'deploy') {
        const { longMessage, shortMessage } = await deployedMarkdown(
          this.commitSha,
          this.stage,
          state.httpApiUrl,
          logsUrl,
        );
        state.shortMessage = shortMessage;
        state.longMessage = longMessage;
      } else if (state.action === 'destroy') {
        const { longMessage, shortMessage } = await destroyedMarkdown(
          this.commitSha,
          this.stage,
          logsUrl,
        );
        state.shortMessage = shortMessage;
        state.longMessage = longMessage;
      }
    } else {
      const { longMessage, shortMessage } = await failedMarkdown(
        this.commitSha,
        this.stage,
        logsUrl,
        state.longMessage,
      );
      state.shortMessage = state.shortMessage || shortMessage;
      state.longMessage = longMessage;
    }

    const status = state.failed ? 'failure' : state.action === 'destroy' ? 'inactive' : 'success';
    state = await this.updateDeployment(state, status);

    return state;
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
    core.startGroup('Stage Details');

    const [, branchType, branchId] = GITHUB_REF?.split('/') || [];
    core.info(`Branch Type: ${branchType}`);
    core.info(`Branch ID: ${branchId}`);

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

    core.info(`Deployment Stage: ${deploymentStage}`);
    core.endGroup();
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
      const pullRequest = context.payload.pull_request;
      if (!pullRequest || !pullRequest.head || !pullRequest.head.sha) {
        throw new Error('Unable to determine PR commit SHA');
      }
      return pullRequest.head.sha.substring(0, 7);
    }
    return context.sha.substring(0, 7);
  }

  get prNumber(): number | undefined {
    if (context.eventName === 'pull_request') {
      return context.payload.pull_request?.number;
    }
    return undefined;
  }

  get isPr(): boolean {
    if (!GITHUB_REF) {
      throw new Error('Unable to determine Pull Request from GITHUB_REF');
    }
    return GITHUB_REF.endsWith('/merge');
  }

  get workflowInputs(): { [key: string]: string } {
    return context.payload.inputs || {};
  }

  get deploymentRef(): string {
    if (!GITHUB_REF) {
      throw new Error('Unable to determine branch from GITHUB_REF');
    }

    if (GITHUB_REF.endsWith('/merge')) {
      if (!GITHUB_HEAD_REF) {
        throw new Error('Unable to determine branch from GITHUB_HEAD_REF');
      }
      return GITHUB_HEAD_REF.replace('refs/heads/', '');
    }

    if (GITHUB_REF.startsWith('refs/tags/')) {
      return GITHUB_REF.replace('refs/tags/', '');
    }

    if (GITHUB_REF.startsWith('refs/heads/')) {
      return GITHUB_REF.replace('refs/heads/', '');
    }

    throw new Error('Unable to determine branch from GITHUB_REF');
  }

  async createDeployment(state: State): Promise<State> {
    const octokit = getOctokit(this.token);

    const { prNumber } = this;

    try {
      const response = await octokit.rest.repos.createDeployment({
        ref: this.deploymentRef,
        required_contexts: [],
        environment: this.stage,
        transient_environment: this.isPr,
        auto_merge: false,
        owner: this.owner,
        repo: this.repo,
        task: context.job,
        payload: {},
        production_environment: this.stage === 'production',
        description: state.shortMessage,
      });

      if (typeof response.data === 'number') {
        state.deploymentId = response.data;
      } else if ('id' in response.data) {
        state.deploymentId = response.data.id;
      }
    } catch (e) {
      if (!(e instanceof Error)) {
        throw e;
      }

      warn(`Unable to create deployment: ${e.message}`);
      state.deploymentId = undefined;
    }

    if (prNumber && state.longMessage) {
      const response = await octokit.rest.issues.createComment({
        body: state.longMessage,
        owner: this.owner,
        repo: this.repo,
        issue_number: prNumber,
      });

      state.commentId = response.data.id;
    }

    return state;
  }

  async updateDeployment(
    state: State,
    status: 'success' | 'failure' | 'in_progress' | 'inactive',
  ): Promise<State> {
    const octokit = getOctokit(this.token);
    const { deploymentId, commentId } = state;

    if (deploymentId) {
      try {
        await octokit.rest.repos.createDeploymentStatus({
          deployment_id: deploymentId,
          state: status,
          environment_url: await this.httpApiUrl,
          log_url: await this.logsUrl,
          environment: this.stage,
          owner: this.owner,
          repo: this.repo,
          description: state.shortMessage,
        });
        notice(`Updated deployment for ${this.stage} to ${status}`);
      } catch (e) {
        if (!(e instanceof Error)) {
          throw e;
        }

        warn(`Unable to update deployment ${deploymentId}: ${e.message}`);
      }
    }

    // If state is inactive:
    // - Mark all deployments as inactive
    // - If its a PR:
    //    - Delete the deployment
    //    - Delete the environment
    if (status === 'inactive') {
      const deployments = await octokit.paginate(octokit.rest.repos.listDeployments, {
        owner: this.owner,
        repo: this.repo,
        environment: this.stage,
      });

      await Promise.all(
        deployments.map(async (deployment) => {
          if (deployment.id === deploymentId) {
            return;
          }

          try {
            debug(`Deactivating deployment ${deployment.id}`);
            await octokit.rest.repos.createDeploymentStatus({
              deployment_id: deployment.id,
              state: 'inactive',
              environment: this.stage,
              owner: this.owner,
              repo: this.repo,
            });
          } catch (e) {
            if (!(e instanceof Error)) {
              throw e;
            }

            warn(`Unable to deactivate deployment ${deployment.id}: ${e.message}`);
          }
        }),
      );

      if (this.isPr) {
        await Promise.all(
          deployments.map(async (deployment) => {
            try {
              debug(`Deleting deployment ${deployment.id}`);
              await octokit.rest.repos.deleteDeployment({
                deployment_id: deployment.id,
                owner: this.owner,
                repo: this.repo,
              });
            } catch (e) {
              if (!(e instanceof Error)) {
                throw e;
              }

              warn(`Unable to delete deployment ${deployment.id}: ${e.message}`);
            }
          }),
        );

        try {
          await octokit.rest.repos.deleteAnEnvironment({
            environment_name: this.stage,
            owner: this.owner,
            repo: this.repo,
          });
          notice(`Deleted environment ${this.stage}`);
        } catch (e) {
          if (!(e instanceof Error)) {
            throw e;
          }

          warn(`Unable to delete environment ${this.stage}: ${e.message}`);
        }
      }
    }

    if (commentId && state.longMessage) {
      debug(`Updating PR comment ${commentId}`);

      await octokit.rest.issues.updateComment({
        comment_id: commentId,
        body: state.longMessage,
        owner: this.owner,
        repo: this.repo,
        issue_number: this.prNumber,
      });
    }

    return state;
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
