import { Action, State } from './action';
import { setFailed, saveState, setOutput, getState, debug } from '@actions/core';

(async () => {
  const action = new Action();
  let state = JSON.parse(getState('state')) as State;

  try {
    state = await action.run(state);
    debug(`new state: ${JSON.stringify(state)}`);
  } catch (e) {
    if (!(e instanceof Error)) {
      throw e;
    }
    debug(`${e}`);
    setFailed(e.message);
  } finally {
    if (state.failed && state.shortMessage) {
      setFailed(state.shortMessage);
      state.shortMessage = undefined;
    }

    setOutput('stage', state.stage);
    setOutput('deployed', state.action === 'deploy');
    setOutput('destroyed', state.action === 'destroy');

    saveState('state', JSON.stringify(state));
  }
})();
