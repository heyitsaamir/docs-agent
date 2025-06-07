import { App } from '@microsoft/teams.apps';
import { DevtoolsPlugin } from '@microsoft/teams.dev';
import { ConversationHistoryService } from './conversationHistoryService.js';
import { DocAgent } from './doc-agent.js';
import { GitAgent } from './git-agent.js';

const USE_GIT_ONLY = false;

const app = new App({
  plugins: [new DevtoolsPlugin()],
});

const getRootConersationId = (conversationId: string): string => {
  // pull the conversationId from '19:eSvf4asEtKZAcyD7xQiZPKac1dDaHduVPa98VOu5LaI1@thread.tacv2;messageid=1748996373679'
  // if messageId exists
  // const parts = conversationId.split(';');
  // if (parts.length > 1) {
  //   return parts[0];
  // }
  // // if messageId does not exist, return the conversationId as is
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
    console.log(`Received message in conversation ${activity.conversation.id}:`, activity.text);
    const conversationId = getRootConersationId(activity.conversation.id);

    // Only proceed with DocAgent if the bot is explicitly mentioned
    const entities = activity.entities || [];
    const clientId = process.env.CLIENT_ID;
    const mentioned = entities.some(
      (e: any) =>
        e.type === 'mention' &&
        typeof e.mentioned?.id === 'string' &&
        clientId &&
        e.mentioned.id.includes(clientId)
    );

    if (mentioned) {
      await send({ type: 'typing' });
      const docAgent = DocAgent.getAgent(conversationId, async (str) => {
        await send(str)
      });
      const result = await docAgent.run(activity.text);
      if (result) {
        await send(result);
      }
    } else {
      console.log(`Bot not mentioned in conversation ${conversationId}, skipping DocAgent processing.`);


      // Always persist the message as a Message type
      ConversationHistoryService.appendMessage(conversationId, {
        role: "user",
        content: activity.text || ""
      });
    }
    // If not mentioned, do nothing further
  });
}

(async () => {
  await app.start(+(process.env.PORT || 3000));
})();
