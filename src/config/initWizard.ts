//This file runs on docker strartup to help the user configure the server.

import fs from "node:fs";
import { promises as fsp } from "node:fs";
import path from "node:path";
import readline from "node:readline";
import { Group, GroupId, AgentAddress } from "../schema.js";
import { DatabaseService } from "../db/service.js";

const DEFAULT_CONFIG_PATH = process.env.GROUP_CONFIG_PATH ?? path.join(process.cwd(), "data", "config.json");
const ANSI = {
  reset: "\u001b[0m",
  bold: "\u001b[1m",
  dim: "\u001b[2m",
  cyan: "\u001b[36m",
  magenta: "\u001b[35m",
  gray: "\u001b[90m"
};

function accent(text: string): string {
  return `${ANSI.cyan}${text}${ANSI.reset}`;
}

function muted(text: string): string {
  return `${ANSI.gray}${text}${ANSI.reset}`;
}

function strong(text: string): string {
  return `${ANSI.bold}${text}${ANSI.reset}`;
}

function banner(): string {
  const lines = [
    "                                 ",
    "╔═══════════════════════════════╗",
    "║  Simple Email Sandbox (SES)   ║",
    "║ private mail for your Agents  ║",
    "╚═══════════════════════════════╝"
  ];
  return lines.map(line => accent(line)).join("\n");
}

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
    rl.question(accent(`➜ ${question}`), (answer) => resolve(answer.trim()));
  });
}

async function runWizard(dbService: DatabaseService) {
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
        terminal: false
    });

    console.log(banner());
    console.log(`${strong("Welcome!")} Let's set up your initial group configuration.\n`);
    console.log(muted("Tip: keep names short and memorable. Agents share a single group namespace.\n"));

    const groupIdSuffix = await ask(rl, "Enter a Group ID. Think of this like a private Domain. (e.g. @Team, @Workflow, @MyAgents): @");
    const groupId: GroupId = `@${groupIdSuffix}`;
    const agents: AgentAddress[] = [];
    while (true) {
        const agent = await ask(rl, "Add an agent handle (e.g. CEO, PM, FrontendDeveloper). Leave blank to finish: ");
        if (agent === "") break;
        agents.push(agent);
    }

    const groupConfig = new Group(groupId, agents);

    // Save group to database
    dbService.createGroup(groupConfig);
    console.log(`\n${strong("Saved")} ${groupId} with agents: ${agents.length > 0 ? agents.join(", ") : muted("none")}`);

    // Also save config file as backup/reference
    const configDir = path.dirname(DEFAULT_CONFIG_PATH);
    await fsp.mkdir(configDir, { recursive: true });
    await fsp.writeFile(DEFAULT_CONFIG_PATH, JSON.stringify(groupConfig, null, 2));
    console.log(`${accent("✔")} Configuration saved to ${DEFAULT_CONFIG_PATH}\n`);

    console.log(muted("Ready. Launching SES with your new crew..."));

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
