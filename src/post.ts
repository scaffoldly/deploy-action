import { Action, State } from './action';
import { setFailed, notice, getState, summary, setOutput } from '@actions/core';
import { debug } from 'console';

(async () => {
  try {
    const action = new Action();
    let state = JSON.parse(getState('state')) as State;

    state = await action.post(state);
    debug(`state: ${JSON.stringify(state)}`);

    if (state.httpApiUrl) {
      setOutput('httpApiUrl', state.httpApiUrl);
    }

    if (state.longMessage) {
      summary.addRaw(state.longMessage, true);
      await summary.write({ overwrite: true });
    }

    if (state.failed) {
      throw new Error(state.shortMessage);
    }

    if (state.shortMessage) {
      notice(state.shortMessage);
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
