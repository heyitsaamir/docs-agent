// @ts-expect-error: If you see a type error for yargs, install @types/yargs
import yargs, { Argv } from 'yargs';
import { hideBin } from 'yargs/helpers';
import { GitAgent } from './git-agent.ts';

const DEFAULT_CONVO_ID = 'test-convo';

const argv = yargs(hideBin(process.argv))
    .command('init [conversationId]', 'Initialize workspace', (y: Argv) => y.positional('conversationId', { type: 'string', describe: 'Conversation ID' }), async (argv: any) => {
        const convoId = argv.conversationId as string || DEFAULT_CONVO_ID;
        const agent = GitAgent.getAgent(convoId);
        await agent.ensureWorkspace();
        console.log(`Workspace initialized for conversation: ${convoId}`);
    })
    .command('apply <file> <content> [conversationId]', 'Apply a file change', (y: Argv) => y
        .positional('file', { type: 'string', describe: 'File path' })
        .positional('content', { type: 'string', describe: 'File content' })
        .positional('conversationId', { type: 'string', describe: 'Conversation ID' }),
        async (argv: any) => {
            const convoId = argv.conversationId as string || DEFAULT_CONVO_ID;
            const agent = GitAgent.getAgent(convoId);
            await agent.ensureWorkspace();
            await agent.applyChanges(convoId, [{ path: argv.file as string, content: argv.content as string }]);
            console.log(`Change applied to ${argv.file} in conversation: ${convoId}`);
        })
    .command('commit <message> [conversationId]', 'Commit and push changes', (y: Argv) => y
        .positional('message', { type: 'string', describe: 'Commit message' })
        .positional('conversationId', { type: 'string', describe: 'Conversation ID' }),
        async (argv: any) => {
            const convoId = argv.conversationId as string || DEFAULT_CONVO_ID;
            const agent = GitAgent.getAgent(convoId);
            await agent.ensureWorkspace();
            await agent.commitAndPush(convoId, argv.message as string);
            console.log(`Committed and pushed for conversation: ${convoId}`);
        })
    .command('pr <title> <body> [conversationId]', 'Create a pull request', (y: Argv) => y
        .positional('title', { type: 'string', describe: 'PR title' })
        .positional('body', { type: 'string', describe: 'PR body' })
        .positional('conversationId', { type: 'string', describe: 'Conversation ID' }),
        async (argv: any) => {
            const convoId = argv.conversationId as string || DEFAULT_CONVO_ID;
            const agent = GitAgent.getAgent(convoId);
            await agent.ensureWorkspace();
            await agent.createPR(convoId, argv.title as string, argv.body as string, 'main');
            console.log(`PR created for conversation: ${convoId}`);
        })
    .command('cleanup [conversationId]', 'Cleanup workspace', (y: Argv) => y
        .positional('conversationId', { type: 'string', describe: 'Conversation ID' }),
        async (argv: any) => {
            const convoId = argv.conversationId as string || DEFAULT_CONVO_ID;
            const agent = GitAgent.getAgent(convoId);
            await agent.cleanup(convoId);
            console.log(`Cleaned up workspace for conversation: ${convoId}`);
        })
    .command('state [conversationId]', 'Show workspace state', (y: Argv) => y
        .positional('conversationId', { type: 'string', describe: 'Conversation ID' }),
        (argv: any) => {
            const convoId = argv.conversationId as string || DEFAULT_CONVO_ID;
            console.log(GitAgent.getState(convoId));
        })
    .demandCommand()
    .help()
    .argv; 