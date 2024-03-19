import { Action } from './action';
import { setFailed, notice, saveState, setOutput, getState } from '@actions/core';
import { PreState } from './pre';

export type RunState = {
  stage: string;
  deploy: boolean;
  destroy: boolean;
  commentId?: number;
  summaryMessage?: string;
};

(async () => {
  try {
    const action = new Action();
    const preState = JSON.parse(getState('state')) as PreState;

    const { stage, deploy, destroy, commentId, summaryMessage } = await action.run(preState);

    setOutput('stage', stage);
    setOutput('deploy', deploy.toString());
    setOutput('destroy', destroy.toString());

    const state: RunState = { stage, deploy, destroy, commentId, summaryMessage };
    saveState('state', JSON.stringify(state));
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
