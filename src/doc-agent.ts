import { ChatPrompt, Message } from "@microsoft/teams.ai";
import { OpenAIChatModel } from "@microsoft/teams.openai";
import fs from 'fs';
import path from 'path';

type ToolDefinition<T> = {
    name: string;
    description: string;
    parameters: T;
    execute: (parameters: T) => Promise<string>;
}

const tools: ToolDefinition<any>[] = [
    {
        name: 'read_file',
        description: 'Read the contents of a given relative file path. Use this when you want to see what\'s inside a file. Do not use this with directory names.',
        parameters: {
            type: 'object',
            properties: {
                path: {
                    type: 'string',
                    description: 'The relative path of a file in the working directory.',
                },
            },
            required: ['path'],
        },
        execute: async ({ path: incomingPath }) => {
            console.log('Executing read_file with path: ', incomingPath);
            const basePath = process.cwd();
            const baseDirectory = path.join(basePath, 'md');
            const fullPath = path.join(baseDirectory, incomingPath);
            const file = fs.readFileSync(fullPath, 'utf8');
            return file;
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
                    description: 'The relative path of a directory in the working directory. By default, it uses \'.\' to refer to the current directory.',
                },
            },
            required: [],
        },
        execute: async ({ path: incomingPath }) => {
            console.log('Executing list_files with path: ', incomingPath);
            // If the path is backward, then throw
            if (incomingPath.includes('..')) {
                throw new Error('Path cannot contain \'..\'');
            }
            const basePath = process.cwd();
            const baseDirectory = path.join(basePath, 'md');
            const fullPath = path.join(baseDirectory, incomingPath);
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
                        const relativePath = path.relative(baseDirectory, filePath);
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
        execute: async ({ path: incomingPath, content }) => {
            console.log('Executing edit_file with path: ', incomingPath);
            const basePath = process.cwd();
            const baseDirectory = path.join(basePath, 'md');
            const fullPath = path.join(baseDirectory, incomingPath);
            // If the directory does not exist, create it
            const directory = path.dirname(fullPath);
            if (!fs.existsSync(directory)) {
                fs.mkdirSync(directory, { recursive: true });
            }
            // If the file does not exist, create it
            fs.writeFileSync(fullPath, content);
            return 'File updated successfully';
        }
    }
]
class DocAgent {
    messages: Message[] = [];
    prompt: ChatPrompt;
    constructor() {
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
            messages: this.messages,
        });

        for (const tool of tools) {
            this.prompt.function(tool.name, tool.description, tool.parameters, tool.execute);
        }

    }

    async run(input: string) {
        console.log(this.messages);
        const result = await this.prompt.send(input);
        return result.content;
    }
}

const docAgent = new DocAgent();
export { docAgent };

