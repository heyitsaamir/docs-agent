// ConversationIdNameService: Maps conversation IDs to unique adjective-animal names, persisted in JSON.

import { faker } from '@faker-js/faker';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const MAP_FILE = path.resolve(__dirname, 'conversation-map.json');

type ConversationMap = Record<string, string>;

export class ConversationIdNameService {
    private static map: ConversationMap | null = null;

    // Load mapping from file, or initialize empty
    private static loadMap(): ConversationMap {
        if (this.map) return this.map as ConversationMap;
        try {
            if (fs.existsSync(MAP_FILE)) {
                const raw = fs.readFileSync(MAP_FILE, 'utf-8');
                this.map = JSON.parse(raw);
            } else {
                this.map = {};
            }
        } catch {
            this.map = {};
        }
        return this.map as ConversationMap;
    }

    // Save mapping atomically
    private static saveMap() {
        if (!this.map) return;
        const tmpFile = MAP_FILE + '.tmp';
        fs.writeFileSync(tmpFile, JSON.stringify(this.map, null, 2), 'utf-8');
        fs.renameSync(tmpFile, MAP_FILE);
    }

    // Generate a unique adjective-animal name
    private static generateUniqueName(): string {
        const usedNames = new Set(Object.values(this.loadMap()));
        let name = '';
        let tries = 0;
        do {
            const adj = faker.word.adjective().toLowerCase();
            const animal = faker.animal.type().toLowerCase().replace(/\s+/g, '-');
            name = `${adj}-${animal}`;
            tries++;
            // Avoid infinite loop in pathological cases
            if (tries > 1000) throw new Error('Unable to generate unique name');
        } while (usedNames.has(name));
        return name;
    }

    // Get or create a safe name for a conversationId
    public static getOrCreateName(conversationId: string): string {
        const map = this.loadMap();
        if (map[conversationId]) return map[conversationId];
        const name = this.generateUniqueName();
        map[conversationId] = name;
        this.saveMap();
        return name;
    }

    // Get name if it exists
    public static getName(conversationId: string): string | undefined {
        const map = this.loadMap();
        return map[conversationId];
    }

    // For testing: reset the mapping
    public static reset() {
        this.map = {};
        this.saveMap();
    }
}
