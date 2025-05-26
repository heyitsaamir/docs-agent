import { ChatPrompt } from "@microsoft/teams.ai";
import { OpenAIChatModel } from "@microsoft/teams.openai";
import { Octokit } from '@octokit/rest';
import fs from 'fs';
import path from 'path';
import { simpleGit } from 'simple-git';
import { v4 as uuidv4 } from 'uuid';
import { ToolDefinition } from "./type.js";

const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const REPO_URL = process.env.REPO_URL;
const GITHUB_OWNER = process.env.GITHUB_OWNER;
const GITHUB_REPO = process.env.GITHUB_REPO;

const octokit = new Octokit({ auth: GITHUB_TOKEN });

const BASE_TMP_DIR = '/tmp/docs-agent';

function getTempRepoPath(conversationId: string): string {
    return path.join(BASE_TMP_DIR, conversationId);
}

function getBranchName(conversationId: string): string {
    return `docs-agent/${conversationId}`;
}

type CheckoutBranchParams = { repoPath: string; branch: string };
type ApplyChangesParams = { repoPath: string; changes: { path: string; content: string }[] };
type CommitAndPushParams = { repoPath: string; branch: string; message: string };
type CreatePrParams = { branch: string; title: string; body: string; base: string };
type CleanupParams = { repoPath: string };

const tools: ToolDefinition[] = [
    {
        name: 'clone_repo',
        description: 'Clone the repository to a temporary directory.',
        parameters: {
            type: 'object',
            properties: {},
            required: [],
        },
        execute: async () => {
            const tempDir = getTempRepoPath(uuidv4());
            const git = simpleGit();
            await git.clone(REPO_URL as string, tempDir);
            return tempDir;
        }
    },
    {
        name: 'checkout_branch',
        description: 'Checkout a new branch in the cloned repository.',
        parameters: {
            type: 'object',
            properties: {
                repoPath: { type: 'string', description: 'Path to the cloned repo.' },
                branch: { type: 'string', description: 'Branch name to create and checkout.' },
            },
            required: ['repoPath', 'branch'],
        },
        execute: async ({ repoPath, branch }: CheckoutBranchParams) => {
            const git = simpleGit(repoPath);
            await git.checkoutLocalBranch(branch);
            return `Checked out branch ${branch}`;
        }
    },
    {
        name: 'apply_changes',
        description: 'Apply file changes (edits/creates) in the repo.',
        parameters: {
            type: 'object',
            properties: {
                repoPath: { type: 'string', description: 'Path to the cloned repo.' },
                changes: {
                    type: 'array', items: {
                        type: 'object',
                        properties: {
                            path: { type: 'string', description: 'Relative file path.' },
                            content: { type: 'string', description: 'New file content.' }
                        },
                        required: ['path', 'content']
                    }, description: 'Array of file changes.'
                }
            },
            required: ['repoPath', 'changes'],
        },
        execute: async ({ repoPath, changes }: ApplyChangesParams) => {
            for (const change of changes) {
                const filePath = path.join(repoPath, change.path);
                const dir = path.dirname(filePath);
                if (!fs.existsSync(dir)) {
                    fs.mkdirSync(dir, { recursive: true });
                }
                fs.writeFileSync(filePath, change.content);
            }
            return 'Changes applied.';
        }
    },
    {
        name: 'commit_and_push',
        description: 'Commit and push changes to remote.',
        parameters: {
            type: 'object',
            properties: {
                repoPath: { type: 'string', description: 'Path to the cloned repo.' },
                branch: { type: 'string', description: 'Branch name.' },
                message: { type: 'string', description: 'Commit message.' },
            },
            required: ['repoPath', 'branch', 'message'],
        },
        execute: async ({ repoPath, branch, message }: CommitAndPushParams) => {
            const git = simpleGit(repoPath);
            await git.add('.');
            await git.commit(message);
            await git.push('origin', branch);
            return 'Committed and pushed changes.';
        }
    },
    {
        name: 'create_pr',
        description: 'Create a pull request on GitHub.',
        parameters: {
            type: 'object',
            properties: {
                branch: { type: 'string', description: 'Branch name.' },
                title: { type: 'string', description: 'PR title.' },
                body: { type: 'string', description: 'PR body.' },
                base: { type: 'string', description: 'Base branch (default: main).' },
            },
            required: ['branch', 'title', 'body', 'base'],
        },
        execute: async ({ branch, title, body, base }: CreatePrParams) => {
            const pr = await octokit.pulls.create({
                owner: GITHUB_OWNER as string,
                repo: GITHUB_REPO as string,
                head: branch,
                base: base || 'main',
                title,
                body,
            });
            return `PR created: ${pr.data.html_url}`;
        }
    },
    {
        name: 'cleanup',
        description: 'Remove the temporary cloned repository directory.',
        parameters: {
            type: 'object',
            properties: {
                repoPath: { type: 'string', description: 'Path to the cloned repo.' },
            },
            required: ['repoPath'],
        },
        execute: async ({ repoPath }: CleanupParams) => {
            fs.rmSync(repoPath, { recursive: true, force: true });
            return 'Temporary directory removed.';
        }
    }
];

interface GitAgentState {
    tempRepoPath: string;
    branchName: string;
    // Add more state as needed
}

class GitAgent {
    private static agents: Map<string, GitAgent> = new Map();
    private static state: Map<string, GitAgentState> = new Map();
    private conversationId: string;
    private prompt: ChatPrompt;

    // Constructor is now public to allow direct instantiation if needed.
    public constructor(conversationId: string) {
        this.conversationId = conversationId;
        this.prompt = new ChatPrompt({
            model: new OpenAIChatModel({
                apiKey: process.env.OPENAI_API_KEY,
                model: 'gpt-4o',
            }),
            instructions: "You are a helpful assistant that manages git operations for documentation changes.",
            messages: [],
        });
        for (const tool of tools) {
            this.prompt.function(tool.name, tool.description, tool.parameters, tool.execute);
        }
    }

    static getAgent(conversationId: string): GitAgent {
        if (!this.agents.has(conversationId)) {
            this.agents.set(conversationId, new GitAgent(conversationId));
        }
        return this.agents.get(conversationId)!;
    }

    static getState(conversationId: string): GitAgentState | undefined {
        return this.state.get(conversationId);
    }
    static setState(conversationId: string, state: GitAgentState) {
        this.state.set(conversationId, state);
    }

    async run(input: string) {
        const result = await this.prompt.send(input);
        return result.content;
    }

    // Utility to check if workspace exists for a conversation
    static workspaceExists(conversationId: string): boolean {
        const state = this.state.get(conversationId);
        return !!(state && fs.existsSync(state.tempRepoPath));
    }

    // Ensure the repo is cloned and branch is checked out for this conversation
    async ensureWorkspace(): Promise<GitAgentState> {
        let state = GitAgent.state.get(this.conversationId);
        const tempRepoPath = getTempRepoPath(this.conversationId);
        const branchName = getBranchName(this.conversationId);
        if (!fs.existsSync(tempRepoPath)) {
            // Clone repo
            console.log(`Cloning repo to ${tempRepoPath}`);
            fs.mkdirSync(BASE_TMP_DIR, { recursive: true });
            const git = simpleGit();
            await git.clone(REPO_URL as string, tempRepoPath);
            const repoGit = simpleGit(tempRepoPath);
            await repoGit.checkoutLocalBranch(branchName);
            state = { tempRepoPath, branchName };
            GitAgent.state.set(this.conversationId, state);
        } else {
            console.log(`Repo already exists in ${tempRepoPath}`);
            state = state ?? { tempRepoPath, branchName };
        }
        return state;
    }

    public async applyChanges(conversationId: string, changes: { path: string, content: string }[]) {
        const state = await this.ensureWorkspace();
        for (const change of changes) {
            const filePath = path.join(state.tempRepoPath, change.path);
            const dir = path.dirname(filePath);
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }
            fs.writeFileSync(filePath, change.content);
        }
        return 'Changes applied.';
    }

    public async commitAndPush(conversationId: string, message: string) {
        const state = await this.ensureWorkspace();
        const git = simpleGit(state.tempRepoPath);
        await git.add('.');
        await git.commit(message);
        await git.push('origin', state.branchName);
        return 'Committed and pushed changes.';
    }

    public async createPR(conversationId: string, title: string, body: string, base: string) {
        const state = await this.ensureWorkspace();
        const pr = await octokit.pulls.create({
            owner: GITHUB_OWNER as string,
            repo: GITHUB_REPO as string,
            head: state.branchName,
            base: base || 'main',
            title,
            body,
        });
        return `PR created: ${pr.data.html_url}`;
    }

    public async cleanup(conversationId: string) {
        const state = GitAgent.getState(conversationId);
        if (state && fs.existsSync(state.tempRepoPath)) {
            fs.rmSync(state.tempRepoPath, { recursive: true, force: true });
            GitAgent.state.delete(conversationId);
            return 'Temporary directory removed.';
        }
        return 'No workspace to clean up.';
    }
}

const agentCard: {
    name: string;
    description: string;
    skills: {
        name: string;
        description: string;
        examples: string[];
    }[];
} = {
    name: 'Git Agent',
    description: 'A helpful assistant that manages git operations for documentation changes.',
    skills: [
        {
            name: 'clone_repo',
            description: 'Clone the repository to a temporary directory.',
            examples: ['Clone the repository to a temporary directory.']
        },
        {
            name: 'checkout_branch',
            description: 'Checkout a new branch in the cloned repository.',
            examples: ['Checkout a new branch in the cloned repository.']
        },
        {
            name: 'apply_changes',
            description: 'Apply the changes to the repository.',
            examples: ['Apply the changes to the repository.']
        }
    ]
}

export { GitAgent };
