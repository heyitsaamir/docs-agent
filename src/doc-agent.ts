import { ChatPrompt } from "@microsoft/teams.ai";
import { OpenAIChatModel } from "@microsoft/teams.openai";
import fs from 'fs';
import path from 'path';
import { ConversationHistoryService } from "./conversationHistoryService.js";
import { GitAgent } from "./git-agent.js";
import { ToolDefinition } from "./type.js";

class DocAgent {
    private prompt: ChatPrompt;
    private conversationId: string;
    private docsPath?: string;
    private docsBranch?: string;

    public async getDocsPath(force: boolean = false): Promise<string> {
        if (force) {
            this.docsPath = undefined;
            this.docsBranch = undefined;
        }
        if (!this.docsPath) {
            const { path, branch } = await GitAgent.getDocsPath(this.conversationId);
            this.docsPath = path;
            this.docsBranch = branch;
            console.log('Docs path: ', this.docsPath, 'Branch:', this.docsBranch);
        }
        return this.docsPath;
    }

    public isMainBranch(): boolean {
        return this.docsBranch === 'main';
    }

    private buildTools(): ToolDefinition[] {
        return [
            {
                name: 'read_file',
                description: 'Read the contents of a given relative file path. Use this when you want to see what\'s inside a file. Do not use this with directory names.',
                parameters: {
                    type: 'object',
                    properties: {
                        paths: {
                            type: 'array',
                            items: {
                                type: 'string',
                                description: 'The relative path of a file in the working directory.',
                            },
                        },
                    },
                    required: ['paths'],
                },
                execute: async (paths: { paths: string[] }) => {
                    // await send('Executing read_file with paths: ' + paths.paths.join(', '));
                    console.log('Executing read_file with paths: ', paths.paths);
                    const results: { path: string, content: string }[] = [];
                    const docsPath = await this.getDocsPath();
                    for (const incomingPath of paths.paths) {
                        console.log('Executing read_file with path: ', incomingPath);
                        const fullPath = path.join(docsPath, incomingPath);
                        const file = fs.readFileSync(fullPath, 'utf8');
                        results.push({ path: incomingPath, content: file });
                    }
                    return results;
                }
            },
            {
                name: 'list_files',
                description: 'List the files in a given relative directory path. Use this when you want to see what\'s inside a directory. Do not use this with file names.',
                parameters: {
                    type: 'object',
                    properties: {
                        path: {
                            type: 'string',
                            description: 'The relative path of a directory in the working directory. By default, it uses \'./\' to refer to the current directory.',
                        },
                    },
                    required: ['path'],
                },
                execute: async ({ path: incomingPath }: { path: string }) => {
                    // await send('Executing list_files with path: ' + incomingPath);
                    console.log('Executing list_files with path: ', incomingPath);
                    // If the path is backward, then throw
                    if (incomingPath.includes('..')) {
                        throw new Error('Path cannot contain \'..\'');
                    }
                    const docsPath = await this.getDocsPath();
                    const fullPath = path.join(docsPath, incomingPath);
                    const directoriesToCrawl = [fullPath];
                    const crawledDirectories = new Set();
                    const output: string[] = [];
                    while (directoriesToCrawl.length > 0) {
                        const currentDirectory = directoriesToCrawl.shift();
                        if (!currentDirectory) {
                            continue;
                        }
                        if (crawledDirectories.has(currentDirectory)) {
                            continue;
                        }
                        crawledDirectories.add(currentDirectory);
                        const files = fs.readdirSync(currentDirectory);
                        for (const file of files) {
                            const filePath = path.join(currentDirectory, file);
                            // The paths need to be relative to the base directory
                            // If it's a directory, then we need to add it to the list of directories to crawl
                            // Otherwise, we need to add it to the output
                            if (fs.statSync(filePath).isDirectory()) {
                                directoriesToCrawl.push(filePath);
                            } else {
                                const relativePath = path.relative(docsPath, filePath);
                                output.push(relativePath);
                            }
                        }
                    }
                    return output.join('\n');
                },
            },
            {
                name: "edit_file",
                description: "Edit the contents of a given relative file path. Use this when you want to change what's inside a file. If the path does not exist, it will be created.",
                parameters: {
                    type: 'object',
                    properties: {
                        path: {
                            type: 'string',
                            description: 'The relative path of a file in the working directory.',
                        },
                        content: {
                            type: 'string',
                            description: 'The new content of the file.',
                        },
                    },
                    required: ['path', 'content'],
                },
                execute: async ({ path: incomingPath, content }: { path: string, content: string }) => {
                    // await send('Executing edit_file with path: ' + incomingPath);
                    console.log('Executing edit_file with path: ', incomingPath);
                    const gitAgent = GitAgent.getAgent(this.conversationId);
                    await gitAgent.applyChanges([{ path: incomingPath, content }]);
                    await gitAgent.commitAndPush(`Update ${incomingPath}`);
                    // If we were on main, reset so next op will re-resolve and pick up the conversation branch
                    if (this.isMainBranch()) {
                        await this.getDocsPath(true);
                    }
                    return 'File updated, committed, and pushed successfully';
                }
            },
            {
                name: "create_pr",
                description: "Create a pull request for the current conversation's branch.",
                parameters: {
                    type: 'object',
                    properties: {
                        title: { type: 'string', description: 'PR title.' },
                        body: { type: 'string', description: 'PR body.' },
                        base: { type: 'string', description: 'Base branch (default: main).' }
                    },
                    required: ['title', 'body'],
                },
                execute: async ({ title, body, base }: { title: string, body: string, base?: string }) => {
                    // await send('Executing create_pr with title: ' + title + ' and body: ' + body + ' and base: ' + base);
                    console.log('Executing create_pr with title: ', title, 'body: ', body, 'base: ', base);
                    const gitAgent = GitAgent.getAgent(this.conversationId);
                    return await gitAgent.createPR(title, body, base || 'main');
                }
            }
        ];
    }

    private constructor(conversationId: string, _send: (str: string) => Promise<void>) {
        this.conversationId = conversationId;
        // Load conversation history and convert to Message[]
        const messages = ConversationHistoryService.getHistory(conversationId);
        console.log('messages', messages);

        this.prompt = new ChatPrompt({
            model: new OpenAIChatModel({
                apiKey: process.env.OPENAI_API_KEY,
                model: 'gpt-4o',
            }),
            instructions: `You are a helpful assistant that helps users with documentation. 
RULES:
1. You have access to the docs via the tools provided. You MUST use those to answer the user's question. 
3. If you see FileCodeBlock in the docs, the source code that it renders should be in the src prop listed with it (inside the static folder). 
4. With your final output, please return the source paths that you used to answer the user's question.`,
            messages,
        });
        const tools = this.buildTools();
        for (const tool of tools) {
            this.prompt.function(tool.name, tool.description, tool.parameters, tool.execute);
        }
    }

    static getAgent(conversationId: string, send: (str: string) => Promise<void>): DocAgent {
        return new DocAgent(conversationId, send)
    }

    async run(input: string) {
        const result = await this.prompt.send(input);
        const outputMessages = await this.prompt.messages.values();
        ConversationHistoryService.setHistory(this.conversationId, outputMessages);
        console.log('output message', outputMessages)
        return result.content;
    }
}

export { DocAgent };
