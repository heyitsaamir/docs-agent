import { App } from '@microsoft/teams.apps';
import { DevtoolsPlugin } from '@microsoft/teams.dev';
import { DocAgent } from './doc-agent.js';
import { GitAgent } from './git-agent.js';

const USE_GIT_ONLY = false;

const app = new App({
  plugins: [new DevtoolsPlugin()],
});

const getRootConersationId = (conversationId: string): string => {
  // pull the conversationId from '19:eSvf4asEtKZAcyD7xQiZPKac1dDaHduVPa98VOu5LaI1@thread.tacv2;messageid=1748996373679'
  // if messageId exists
  const parts = conversationId.split(';');
  if (parts.length > 1) {
    return parts[0];
  }
  // if messageId does not exist, return the conversationId as is
  return conversationId;

}

if (USE_GIT_ONLY) {
  app.on('message', async ({ send, activity }) => {
    await send({ type: 'typing' });
    const conversationId = getRootConersationId(activity.conversation.id);
    const gitAgent = GitAgent.getAgent(conversationId);
    const result = await gitAgent.run(activity.text);
    if (result) {
      await send(result);
    }
  });
} else {
  app.on('message', async ({ send, activity }) => {
    await send({ type: 'typing' });
    const conversationId = getRootConersationId(activity.conversation.id);
    const docAgent = DocAgent.getAgent(conversationId, async (str) => {
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
