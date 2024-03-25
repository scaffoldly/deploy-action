import { Action, State } from './action';
import { setFailed, notice, saveState, setOutput, getState, debug } from '@actions/core';

(async () => {
  try {
    const action = new Action();
    let state = JSON.parse(getState('state')) as State;

    state = await action.run(state);

    debug(`state: ${JSON.stringify(state)}`);

    setOutput('stage', state.stage);
    setOutput('deploy', state.deploy.toString());
    setOutput('destroy', state.destroy.toString());

    saveState('state', JSON.stringify(state));

    if (state.failed) {
      throw new Error(state.shortMessage);
    }
  } catch (e) {
    if (e instanceof Error) {
      setFailed(e);
      notice(`Need help? https://scaffoldly.dev/help`);
      return;
    }
    throw e;
  }
})();
