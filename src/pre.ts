import { Action, State } from './action';
import { setFailed, saveState, debug } from '@actions/core';

(async () => {
  const action = new Action();

  let state: State = {
    deploy: false,
    destroy: false,
  };

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
    saveState('state', JSON.stringify(state));
  }
})();
