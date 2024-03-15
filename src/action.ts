import { debug, notice } from '@actions/core';
import { getInput } from '@actions/core';
import { warn } from 'console';
import fs from 'fs';
import path from 'path';
import { CloudFormationClient, DescribeStacksCommand } from '@aws-sdk/client-cloudformation';

const { GITHUB_TOKEN } = process.env;

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
  httpApiUrl?: string;

  async run(): Promise<void> {
    debug('Running!');

    const token = getInput('token') || GITHUB_TOKEN;

    if (!token) {
      throw new Error('Missing GitHub Token');
    }
  }

  async post(): Promise<void> {
    debug('Post Running!');

    const token = getInput('token') || GITHUB_TOKEN;

    if (!token) {
      throw new Error('Missing GitHub Token');
    }

    let serverlessState: ServerlessState | undefined = undefined;

    try {
      serverlessState = JSON.parse(
        fs.readFileSync(path.join('.serverless', 'serverless-state.json'), 'utf8'),
      );
    } catch (e) {
      warn('No serverless state found.');
      debug(e);
      return;
    }

    try {
      const stackName = `${serverlessState!.service.service}-${
        serverlessState!.service.provider.stage
      }`;

      const client = new CloudFormationClient({ region: serverlessState!.service.provider.region });

      const describeStacks = await client.send(new DescribeStacksCommand({ StackName: stackName }));

      const stack = describeStacks.Stacks?.find(
        (s) =>
          s.StackName === stackName &&
          s.Tags?.find(
            (t) => t.Key === 'STAGE' && t.Value === serverlessState!.service.provider.stage,
          ),
      );

      if (!stack) {
        warn('Unable to find stack.');
        debug(JSON.stringify(describeStacks));
        return;
      }

      this.httpApiUrl = stack.Outputs?.find((o) => o.OutputKey === 'HttpApiUrl')?.OutputValue;
    } catch (e) {
      warn('Unable to determine HTTP API URL.');
      debug(e);
      return;
    }

    notice(`HTTP API URL: ${this.httpApiUrl}`);
  }
}
