import { Action } from './action';
import { setFailed, notice, saveState, debug } from '@actions/core';

export type PreState = {
  deploy: boolean;
  destroy: boolean;
  stage: string;
  commentId?: number;
};

(async () => {
  try {
    const action = new Action();
    const preState = await action.pre();
    debug('preState: ' + JSON.stringify(preState));
    saveState('preState', JSON.stringify(preState));
  } catch (e) {
    if (e instanceof Error) {
      setFailed(e.message);
      notice(`Need help? https://scaffoldly.dev/help`);
      return;
    }
    throw e;
  }
})();
