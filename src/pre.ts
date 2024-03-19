import { Action } from './action';
import { setFailed, notice, saveState } from '@actions/core';

export type PreState = {
  deploy: boolean;
  destroy: boolean;
  stage: string;
  commentId?: number;
};

(async () => {
  try {
    const action = new Action();
    const state = await action.pre();
    saveState('preState', JSON.stringify(state));
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
