//This file runs on docker strartup to help the user configure the server.

import fs from "node:fs";
import { promises as fsp } from "node:fs";
import path from "node:path";
import readline from "node:readline";
import { Group, GroupId, AgentAddress } from "../schema";
import { DatabaseService } from "../db/service";

const DEFAULT_CONFIG_PATH = process.env.GROUP_CONFIG_PATH ?? "/data/config.json";

function fileExists(file_path: string): boolean {
    try {
        fs.accessSync(file_path, fs.constants.F_OK);
        return true;
    } catch {
        return false;
    }
}

function ask(rl: readline.Interface, question: string): Promise<string> {
  return new Promise((resolve) => {
    rl.question(question, (answer) => resolve(answer.trim()));
  });
}

async function runWizard(dbService: DatabaseService) {
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
        terminal: false
    });

    console.log("Welcome to the Agent Email MCP Initialization Wizard!");
    console.log("Let's set up your initial group configuration.\n");

    const groupIdSuffix = await ask(rl, "Enter a unique Group ID (@");
    const groupId: GroupId = `@${groupIdSuffix}`;
    const agents: AgentAddress[] = [];
    while(true) {
        const agent = await ask(rl, "Enter an Agent Address to add (or leave blank to finish): ");
        if(agent === "") break;
        agents.push(agent);
    }

    const groupConfig = new Group(groupId, agents);

    // Save group to database
    dbService.createGroup(groupConfig);
    console.log(`\nGroup created in database: ${groupId}`);

    // Also save config file as backup/reference
    const configDir = path.dirname(DEFAULT_CONFIG_PATH);
    await fsp.mkdir(configDir, { recursive: true });
    await fsp.writeFile(DEFAULT_CONFIG_PATH, JSON.stringify(groupConfig, null, 2));
    console.log(`Configuration also saved to ${DEFAULT_CONFIG_PATH}`);

    rl.close();
}

export async function runWizardIfNeeded(dbService: DatabaseService): Promise<void> {
  if (fileExists(DEFAULT_CONFIG_PATH)) {
    console.log(
      `Configuration file already exists at ${DEFAULT_CONFIG_PATH}. Initialization wizard will not run.`
    );
    return;
  }
  await runWizard(dbService);
}

