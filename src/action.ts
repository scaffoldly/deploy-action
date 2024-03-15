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
    let createStack = {};
    let updateStack = {};

    try {
      serverlessState = JSON.parse(
        fs.readFileSync(path.join('.serverless', 'serverless-state.json'), 'utf8'),
      );
    } catch (e) {
      warn('No serverless state found.');
    }

    try {
      createStack = JSON.parse(
        fs.readFileSync(
          path.join('.serverless', 'cloudformation-template-create-stack.json'),
          'utf8',
        ),
      );
    } catch (e) {
      warn('No cloudformation create stack found.');
    }

    try {
      updateStack = JSON.parse(
        fs.readFileSync(
          path.join('.serverless', 'cloudformation-template-update-stack.json'),
          'utf8',
        ),
      );
    } catch (e) {
      warn('No cloudformation update stack found.');
    }

    console.log('!!! serverlessState', JSON.stringify(serverlessState));
    console.log('!!! createStack', JSON.stringify(createStack));
    console.log('!!! updateStack', JSON.stringify(updateStack));
  }
}
