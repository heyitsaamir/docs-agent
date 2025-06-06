# TODO: Doc Agent & Git Agent Conversation-Scoped Architecture

## 1. Conversation-Scoped State Management

- [x] Update Doc Agent and Git Agent constructors to accept `conversationId`.
- [x] Store all state (message history, temp paths, etc.) in a map keyed by `conversationId`.

## 2. Git Workspace Management

- [x] On first call for a `conversationId`, clone the repo to `/tmp/docs-agent/<conversationId>`.
- [x] Create and checkout branch `docs-agent/<conversationId>`.
- [x] Store `{ tempRepoPath, branchName }` in state.

## 3. Edit Workflow

- [ ] Doc Agent gathers list of file changes (path + new content).
- [ ] Doc Agent calls Git Agent with `conversationId` and changes.
- [ ] Git Agent ensures repo is cloned and branch is checked out for this `conversationId`.
- [ ] Git Agent applies file changes in the temp repo and stages them.

## 4. Commit & Push

- [ ] Doc Agent instructs Git Agent to commit and push changes.
- [ ] Git Agent commits with a message and pushes to remote on the dedicated branch.

## 5. Create Pull Request

- [ ] Doc Agent instructs Git Agent to create a PR.
- [ ] Git Agent uses the branch for this `conversationId` to open a PR to the main branch.

## 6. Cleanup

- [ ] After PR is merged/closed or conversation is finished, Doc Agent instructs Git Agent to:
  - [ ] Delete the temp directory.
  - [ ] Optionally, delete the remote branch.

## 7. Error Handling & Recovery

- [ ] If any git operation fails, Git Agent should report back with a clear error.
- [ ] Optionally, allow retry or manual intervention.

## Utilities & Helpers

- [ ] Utility to generate temp paths and branch names from `conversationId`.
- [ ] Utility to check if a workspace already exists for a conversation.

## (Optional) Enhancements

- [ ] Add timeouts/cleanup for stale conversations.
- [ ] Add logging/audit trail per conversation.
- [ ] Add locking to prevent concurrent edits to the same conversation.
