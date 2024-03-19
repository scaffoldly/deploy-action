import { Action } from './action';
import { setFailed, notice, getState, summary, setOutput } from '@actions/core';
import { RunState } from './main';

(async () => {
  try {
    const action = new Action();
    const runState = JSON.parse(getState('runState')) as RunState;

    const { httpApiUrl, summaryMessage } = await action.post(runState);

    if (httpApiUrl) {
      setOutput('httpApiUrl', httpApiUrl);
      notice(`API URL: ${httpApiUrl}`);
    }

    summary.addRaw(summaryMessage, true);
    await summary.write({ overwrite: true });
  } catch (e) {
    if (e instanceof Error) {
      setFailed(e.message);
      notice(`Need help? https://scaffoldly.dev/help`);
      return;
    }
    throw e;
  }
  process.exit(0);
})();
