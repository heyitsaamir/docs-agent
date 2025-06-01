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
        // Register tools using instance methods, relying on internal state
        const tools: ToolDefinition[] = [
            {
                name: 'clone_repo',
                description: 'Clone the repository to a temporary directory.',
                parameters: {
                    type: 'object',
                    properties: {},
                    required: [],
                },
                execute: this.cloneRepo.bind(this)
            },
            {
                name: 'apply_changes',
                description: 'Apply file changes (edits/creates) in the repo.',
                parameters: {
                    type: 'object',
                    properties: {
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
                    required: ['changes'],
                },
                execute: async ({ changes }: { changes: { path: string, content: string }[] }) => this.applyChanges(changes)
            },
            {
                name: 'commit_and_push',
                description: 'Commit and push changes to remote.',
                parameters: {
                    type: 'object',
                    properties: {
                        message: { type: 'string', description: 'Commit message.' },
                    },
                    required: ['message'],
                },
                execute: async ({ message }: { message: string }) => this.commitAndPush(message)
            },
            {
                name: 'create_pr',
                description: 'Create a pull request on GitHub.',
                parameters: {
                    type: 'object',
                    properties: {
                        title: { type: 'string', description: 'PR title.' },
                        body: { type: 'string', description: 'PR body.' },
                        base: { type: 'string', description: 'Base branch (default: main).' },
                    },
                    required: ['title', 'body'],
                },
                execute: async ({ title, body, base }: { title: string, body: string, base?: string }) => this.createPR(title, body, base || 'main')
            },
            {
                name: 'cleanup',
                description: 'Remove the temporary cloned repository directory.',
                parameters: {
                    type: 'object',
                    properties: {},
                    required: [],
                },
                execute: this.cleanup.bind(this)
            }
        ];
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

    static workspaceExists(conversationId: string): boolean {
        const state = this.state.get(conversationId);
        return !!(state && fs.existsSync(state.tempRepoPath));
    }

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
        } else {
            console.debug(`Repo already exists in ${tempRepoPath}`);
        }
        const repoGit = simpleGit(tempRepoPath);
        // Try to pull from remote if branch exists
        try {
            console.log('Checking out branch:', branchName);
            await repoGit.checkoutLocalBranch(branchName);
        } catch (err) {
            console.debug('Error checking out branch. Continuing...');
        }
        try {
            console.log('Pulling branch:', branchName);
            await repoGit.pull('origin', branchName);
        } catch (err) {
            // If the branch doesn't exist on remote, ignore the error
            console.log(`Remote branch ${branchName} does not exist or could not be pulled. Continuing.`);
        }
        state = { tempRepoPath, branchName };
        GitAgent.state.set(this.conversationId, state);
        return state;
    }

    // Instance tool methods for tool registration
    private async cloneRepo() {
        const tempDir = getTempRepoPath(uuidv4());
        // If it already exists, just say it's already cloned, and return the tempDir
        if (fs.existsSync(tempDir)) {
            console.debug(`Repo already exists in ${tempDir}`);
            return tempDir;
        }
        const git = simpleGit();
        await git.clone(REPO_URL as string, tempDir);
        return tempDir;
    }

    public async applyChanges(changes: { path: string, content: string }[]) {
        console.log('Applying changes:', changes);
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

    public async commitAndPush(message: string) {
        console.log('Committing and pushing changes:', message);
        try {
            const state = await this.ensureWorkspace();
            const git = simpleGit(state.tempRepoPath);
            await git.add('.');
            await git.commit(message);
            await git.push('origin', state.branchName);
        } catch (err) {
            console.error('Error committing and pushing changes:', err);
            throw err;
        }
        return 'Committed and pushed changes.';
    }

    public async createPR(title: string, body: string, base: string) {
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

    public async cleanup() {
        const state = GitAgent.getState(this.conversationId);
        if (state && fs.existsSync(state.tempRepoPath)) {
            fs.rmSync(state.tempRepoPath, { recursive: true, force: true });
            GitAgent.state.delete(this.conversationId);
            return 'Temporary directory removed.';
        }
        return 'No workspace to clean up.';
    }

    /**
     * Returns the local docs path for a given conversation. Ensures the repo is cloned and up-to-date.
     * If the conversation branch exists, uses it; otherwise, falls back to main branch.
     * Returns the path to the docs root (assume docs are at the root of the repo).
     */
    static async getDocsPath(conversationId: string): Promise<{ path: string, branch: string }> {
        const tempRepoPath = getTempRepoPath(conversationId);
        const branchName = getBranchName(conversationId);
        fs.mkdirSync(BASE_TMP_DIR, { recursive: true });
        const git = simpleGit();
        // If repo doesn't exist locally, clone it
        if (!fs.existsSync(tempRepoPath)) {
            await git.clone(REPO_URL as string, tempRepoPath);
        }
        const repoGit = simpleGit(tempRepoPath);
        let branch = 'main';
        try {
            await repoGit.fetch();
            await repoGit.checkout(branchName);
            await repoGit.pull('origin', branchName);
            branch = branchName;
        } catch (err) {
            await repoGit.checkout('main');
            await repoGit.pull('origin', 'main');
            branch = 'main';
        }
        return { path: tempRepoPath, branch };
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
            name: 'apply_changes',
            description: 'Apply the changes to the repository.',
            examples: ['Apply the changes to the repository.']
        }
    ]
}

export { GitAgent };
