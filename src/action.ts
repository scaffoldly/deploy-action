import { debug, notice, getIDToken } from '@actions/core';
import { getInput } from '@actions/core';
import { warn } from 'console';
import fs from 'fs';
import path from 'path';
import { CloudFormationClient, DescribeStacksCommand } from '@aws-sdk/client-cloudformation';
// import axios from 'axios';
import * as jose from 'jose';

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
  async run(): Promise<void> {
    debug('Running!');

    const token = getInput('token') || GITHUB_TOKEN;

    if (!token) {
      throw new Error('Missing GitHub Token');
    }

    let idToken: string | undefined = undefined;

    try {
      idToken = await getIDToken();
    } catch (e) {
      warn('Unable to get ID Token.');
      debug(`Error: ${e}`);
    }

    if (!idToken) {
      warn('No ID Token found.');
      return;
    }

    // console.log(
    //   '!!! idToken',
    //   Buffer.from(Buffer.from(idToken, 'utf8').toString('base64'), 'utf8').toString('base64'),
    // );

    const JWKS = jose.createRemoteJWKSet(
      new URL('https://token.actions.githubusercontent.com/.well-known/jwks'),
    );

    const { payload, protectedHeader } = await jose.jwtVerify(idToken, JWKS, {
      issuer: 'https://token.actions.githubusercontent.com',
      // audience: 'urn:example:audience',
    });

    console.log('!!! payload', payload);
    console.log('!!! protectedHeader', protectedHeader);
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
      debug(`Error: ${e}`);
      return;
    }

    let httpApiUrl: string | undefined = undefined;

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

      httpApiUrl = stack.Outputs?.find((o) => o.OutputKey === 'HttpApiUrl')?.OutputValue;
    } catch (e) {
      warn('Unable to determine HTTP API URL.');
      debug(`Error: ${e}`);
      return;
    }

    notice(`HTTP API URL: ${httpApiUrl}`);
  }
}
