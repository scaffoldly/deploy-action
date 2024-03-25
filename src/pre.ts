import { Action } from './action';
import { setFailed, notice, saveState, debug } from '@actions/core';

(async () => {
  try {
    const action = new Action();
    const state = await action.pre();
    debug('state: ' + JSON.stringify(state));
    saveState('state', JSON.stringify(state));

    if (state.failed) {
      throw new Error(state.shortMessage);
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
