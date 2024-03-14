import { getInput } from '@actions/core';

const { GITHUB_TOKEN } = process.env;

export class Action {
  async run(): Promise<void> {
    const token = getInput('token') || GITHUB_TOKEN;

    if (!token) {
      throw new Error('Missing GitHub Token');
    }

    console.log('Running!');
  }

  async post(): Promise<void> {
    const token = getInput('token') || GITHUB_TOKEN;

    if (!token) {
      throw new Error('Missing GitHub Token');
    }

    console.log('Post!');
  }
}
