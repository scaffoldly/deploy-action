import { Action } from './action';
import { setFailed, notice, getState } from '@actions/core';
import { ActionState } from './main';

(async () => {
  try {
    const action = new Action();
    const state = JSON.parse(getState('state')) as ActionState;
    await action.post(state);
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
