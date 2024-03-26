import { Action, State } from './action';
import { setFailed, notice, getState, summary, setOutput } from '@actions/core';
import { debug } from 'console';

(async () => {
  const action = new Action();
  let state = JSON.parse(getState('state')) as State;

  try {
    state = await action.post(state);
    debug(`new state: ${JSON.stringify(state)}`);

    if (state.httpApiUrl) {
      setOutput('httpApiUrl', state.httpApiUrl);
    }

    if (state.failed) {
      throw new Error(state.shortMessage);
    }
  } catch (e) {
    if (!(e instanceof Error)) {
      throw e;
    }
    debug(`${e}`);
    setFailed(e.message);
  } finally {
    if (state.shortMessage) {
      notice(state.shortMessage);
    }

    if (state.longMessage) {
      summary.addRaw(state.longMessage, true);
      await summary.write({ overwrite: true });
    }
  }
})();
