# docs-agent

A conversation-scoped documentation and Git automation agent for Microsoft Teams, built with the Teams AI Library v2. This project enables intelligent, multi-turn documentation editing, file management, and GitHub PR workflows, all scoped to individual conversations.

## Features

- **Conversation-Scoped State:** Each conversation gets its own isolated workspace and Git branch.
- **DocAgent:** Reads, lists, and edits documentation files, and can create pull requests for changes.
- **GitAgent:** Handles all Git operations (clone, branch, commit, push, PR, cleanup) for a given conversation.
- **Teams Integration:** Designed to run as a Teams bot, with DevTools for local development and debugging.
- **CLI Support:** Scriptable interface for initializing workspaces, applying changes, committing, creating PRs, and cleaning up.

## Architecture

- **DocAgent:**

  - Exposes tools for reading, listing, and editing files in the documentation repo.
  - Delegates Git operations to the GitAgent.
  - Ensures all actions are scoped to the current conversation's branch and workspace.

- **GitAgent:**

  - Manages a temporary clone of the repo per conversation (in `/tmp/docs-agent/<conversationId>`).
  - Creates a dedicated branch (`docs-agent/<conversationId>`) for each conversation.
  - Handles file changes, commits, pushes, PR creation, and cleanup.

- **Entry Point:**
  - `src/index.ts` starts the Teams bot and routes messages to either the DocAgent or GitAgent, depending on configuration.

## Usage

### As a Teams Bot

1. **Install dependencies:**

   ```bash
   npm install
   ```

2. **Set up environment variables:**

   - `GITHUB_TOKEN`: GitHub personal access token with repo permissions.
   - `REPO_URL`: HTTPS URL of the target GitHub repository.
   - `GITHUB_OWNER`: GitHub username or org.
   - `GITHUB_REPO`: Repository name.
   - `OPENAI_API_KEY`: API key for OpenAI (for LLM-powered prompts).

   Create a `.env` file in the root:

   ```
   GITHUB_TOKEN=...
   REPO_URL=...
   GITHUB_OWNER=...
   GITHUB_REPO=...
   OPENAI_API_KEY=...
   ```

3. **Run in development mode:**

   ```bash
   npm run dev
   ```

4. **Bot will listen on the port specified by `PORT` (default: 3000).**

### CLI Usage

A CLI is available for direct GitAgent operations:

```bash
npx tsx src/cli.ts <command>
```

Commands:

- `init [conversationId]` — Initialize workspace for a conversation.
- `apply <file> <content> [conversationId]` — Apply a file change.
- `commit <message> [conversationId]` — Commit and push changes.
- `pr <title> <body> [conversationId]` — Create a pull request.
- `cleanup [conversationId]` — Remove the temporary workspace.
- `state [conversationId]` — Show workspace state.

### Example Workflow

1. User interacts with the bot in Teams.
2. DocAgent uses tools to read, list, or edit documentation files.
3. When editing, DocAgent calls GitAgent to apply changes, commit, and push to a conversation-specific branch.
4. User can request a PR to be created for their changes.
5. After PR is merged/closed, workspace can be cleaned up.

## Development

- **TypeScript** project, source in `src/`.
- Uses [simple-git](https://www.npmjs.com/package/simple-git) for Git operations and [@octokit/rest](https://github.com/octokit/rest.js) for GitHub API.
- [@microsoft/teams.ai](https://www.npmjs.com/package/@microsoft/teams.ai) and related packages for Teams bot and LLM integration.

### Scripts

- `npm run build` — Compile TypeScript to `dist/`
- `npm run dev` — Start in watch mode with hot reload
- `npm start` — Run compiled app

## Project Structure

```
src/
  doc-agent.ts   # DocAgent: file/documentation operations
  git-agent.ts   # GitAgent: git and GitHub operations
  index.ts       # Entry point (Teams bot)
  cli.ts         # CLI for GitAgent
  type.ts        # Shared types
todo.md          # Project TODOs and architecture notes
```

## TODOs & Roadmap

See [`todo.md`](./todo.md) for planned features and enhancements, including:

- Improved error handling and recovery
- Stale conversation cleanup
- Audit logging
- Locking for concurrent edits

## License

MIT
