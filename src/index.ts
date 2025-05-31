import { App } from '@microsoft/teams.apps';
import { DevtoolsPlugin } from '@microsoft/teams.dev';
import { DocAgent } from './doc-agent.js';
import { GitAgent } from './git-agent.js';

const USE_GIT_ONLY = false;

const app = new App({
  plugins: [new DevtoolsPlugin()],
});

if (USE_GIT_ONLY) {
  app.on('message', async ({ send, activity }) => {
    await send({ type: 'typing' });
    const gitAgent = GitAgent.getAgent(activity.conversation.id);
    const result = await gitAgent.run(activity.text);
    if (result) {
      await send(result);
    }
  });
} else {
  app.on('message', async ({ send, activity }) => {
    await send({ type: 'typing' });
    const docAgent = DocAgent.getAgent(activity.conversation.id, async (str) => {
      await send(str)
    });
    const result = await docAgent.run(activity.text);
    if (result) {
      await send(result);
    }
  });
}

(async () => {
  await app.start(+(process.env.PORT || 3000));
})();
