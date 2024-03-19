import { Action } from './action';
import { setFailed, notice, saveState, setOutput, summary } from '@actions/core';

export type ActionState = {
  stage: string;
  deploy: boolean;
  destroy: boolean;
  commentId?: number;
};

(async () => {
  try {
    const action = new Action();
    const { stage, deploy, destroy, failed, commentId, noticeMessage } = await action.run();

    setOutput('stage', stage);
    setOutput('deploy', deploy.toString());
    setOutput('destroy', destroy.toString());

    const state: ActionState = { stage, deploy, destroy, commentId };
    saveState('state', JSON.stringify(state));

    if (failed) {
      throw new Error(noticeMessage);
    }

    if (noticeMessage) {
      summary.addRaw(noticeMessage, true);
      await summary.write({ overwrite: true });
    }
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
