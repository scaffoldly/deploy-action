import { Action } from './action';
import { setFailed, notice, getState, summary, setOutput } from '@actions/core';
import { RunState } from './main';
import { debug } from 'console';

export type PostState = RunState & {
  httpApiUrl?: string;
};

(async () => {
  try {
    const action = new Action();
    const runState = JSON.parse(getState('runState')) as RunState;

    const postState = await action.post(runState);
    debug(`postState: ${JSON.stringify(postState)}`);

    if (postState.httpApiUrl) {
      setOutput('httpApiUrl', postState.httpApiUrl);
      notice(`URL: ${postState.httpApiUrl}`);
    }

    if (postState.summaryMessage) {
      summary.addRaw(postState.summaryMessage, true);
      await summary.write({ overwrite: true });
    }
  } catch (e) {
    if (e instanceof Error) {
      setFailed(e.message);
      notice(`Need help? https://scaffoldly.dev/help`);
      return;
    }
    throw e;
  }
})();
