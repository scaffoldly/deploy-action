import { Action, State } from './action';
import { setFailed, saveState, debug } from '@actions/core';

(async () => {
  const action = new Action();

  let state: State = {};

  try {
    state = await action.pre(state);
    debug('updated state: ' + JSON.stringify(state));
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

    saveState('state', JSON.stringify(state));
  }
})();
