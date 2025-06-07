// ConversationHistoryService: Handles persistent storage of conversation history.
// Stores each conversation's messages in conversation-history/{conversationId}.json

import { Message } from "@microsoft/teams.ai";
import fs from 'fs';
import path from 'path';


export class ConversationHistoryService {
    private static historyDir = path.join(process.cwd(), 'conversation-history');

    // Ensure the storage directory exists
    private static ensureDir() {
        if (!fs.existsSync(this.historyDir)) {
            fs.mkdirSync(this.historyDir, { recursive: true });
        }
    }

    // Get the file path for a conversation
    private static getFilePath(conversationId: string) {
        return path.join(this.historyDir, `${conversationId}.json`);
    }

    // Append a message to the conversation history
    static appendMessage(conversationId: string, message: Message) {
        this.ensureDir();
        const filePath = this.getFilePath(conversationId);
        let history: Message[] = [];
        if (fs.existsSync(filePath)) {
            try {
                const data = fs.readFileSync(filePath, 'utf8');
                history = JSON.parse(data);
            } catch {
                // If file is corrupted, start fresh
                history = [];
            }
        }
        history.push(message);
        fs.writeFileSync(filePath, JSON.stringify(history, null, 2), 'utf8');
    }

    // Retrieve the conversation history
    static getHistory(conversationId: string): Message[] {
        this.ensureDir();
        const filePath = this.getFilePath(conversationId);
        if (fs.existsSync(filePath)) {
            try {
                const data = fs.readFileSync(filePath, 'utf8');
                return JSON.parse(data);
            } catch {
                return [];
            }
        }
        return [];
    }

    static setHistory(conversationId: string, history: Message[]) {
        this.ensureDir();
        const filePath = this.getFilePath(conversationId);
        fs.writeFileSync(filePath, JSON.stringify(history, null, 2), 'utf8');
    }
}
