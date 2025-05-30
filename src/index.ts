import { App } from '@microsoft/teams.apps';
import { DevtoolsPlugin } from '@microsoft/teams.dev';
import { GitAgent } from './git-agent.js';

const app = new App({
  plugins: [new DevtoolsPlugin()],
});

app.on('message', async ({ send, activity }) => {
  await send({ type: 'typing' });
  const gitAgent = GitAgent.getAgent(activity.conversation.id);
  const result = await gitAgent.run(activity.text);
  if (result) {
    await send(result);
  }
});

(async () => {
  await app.start(+(process.env.PORT || 3000));
})();
