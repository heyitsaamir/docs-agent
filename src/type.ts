
import { FunctionHandler, Schema } from "@microsoft/teams.ai";

export type ToolDefinition = {
    name: string;
    description: string;
    parameters: Schema;
    execute: FunctionHandler;
}