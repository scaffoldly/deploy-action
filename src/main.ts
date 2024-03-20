import { Action } from './action';
import { setFailed, notice, saveState, setOutput, getState, debug } from '@actions/core';
import { PreState } from './pre';

export type RunState = PreState & {
  summaryMessage?: string;
};

(async () => {
  try {
    const action = new Action();
    const preState = JSON.parse(getState('preState')) as PreState;

    const runState = await action.run(preState);
    debug(`runState: ${JSON.stringify(runState)}`);

    setOutput('stage', runState.stage);
    setOutput('deploy', runState.deploy.toString());
    setOutput('destroy', runState.destroy.toString());

    saveState('runState', JSON.stringify(runState));
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
