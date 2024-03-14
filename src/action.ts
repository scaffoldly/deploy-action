import { debug } from '@actions/core';
import { getInput } from '@actions/core';
import { warn } from 'console';
import fs from 'fs';
import path from 'path';

const { GITHUB_TOKEN } = process.env;

export class Action {
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

    let serverlessState = {};

    try {
      serverlessState = JSON.parse(
        fs.readFileSync(path.join('.serverless', 'serverless-state.json'), 'utf8'),
      );
    } catch (e) {
      warn('No serverless state found, skipping post deployment actions.');
      return;
    }

    console.log('!!! serverlessState', serverlessState);
  }
}
