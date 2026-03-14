import * as path from 'path';
import * as fs from 'fs';
import * as vscode from 'vscode';
import { spawn } from 'child_process';

type Outcome = 'success' | 'error';

type TerminalState = {
  lastTriggeredAt: number;
  lastTriggeredOutcome?: Outcome;
};

const OUTCOME_COOLDOWN_MS = 3000;

let statusBarItem: vscode.StatusBarItem;
let activeAudioProcess: ReturnType<typeof spawn> | undefined;
const terminalStates = new Map<vscode.Terminal, TerminalState>();

export function activate(context: vscode.ExtensionContext): void {
  statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
  statusBarItem.command = 'compileAndPray.toggleSounds';
  context.subscriptions.push(statusBarItem);

  updateStatusBar(context);

  for (const terminal of vscode.window.terminals) {
    ensureTerminalState(terminal);
  }

  context.subscriptions.push(
    vscode.commands.registerCommand('compileAndPray.testSuccessSound', () => {
      handleOutcome('success', context, true);
    }),
    vscode.commands.registerCommand('compileAndPray.testErrorSound', () => {
      handleOutcome('error', context, true);
    }),
    vscode.commands.registerCommand('compileAndPray.toggleSounds', async () => {
      const enabled = getIsEnabled(context);
      await vscode.workspace
        .getConfiguration('compileAndPray')
        .update('enableSounds', !enabled, vscode.ConfigurationTarget.Global);
      updateStatusBar(context);
      vscode.window.showInformationMessage(
        !enabled ? '🙏 Compile and Pray enabled.' : '🙏 Compile and Pray muted.'
      );
    }),
    vscode.workspace.onDidChangeConfiguration((event) => {
      if (event.affectsConfiguration('compileAndPray')) {
        updateStatusBar(context);
      }
    }),
    vscode.window.onDidOpenTerminal((terminal) => {
      ensureTerminalState(terminal);
    }),
    vscode.window.onDidCloseTerminal((terminal) => {
      terminalStates.delete(terminal);
      const exitCode = terminal.exitStatus?.code;
      if (typeof exitCode === 'number') {
        void handleOutcome(exitCode === 0 ? 'success' : 'error', context, false, terminal);
      }
    })
  );

  attachShellExecutionListener(context);
}

export function deactivate(): void {
  if (activeAudioProcess && !activeAudioProcess.killed) {
    activeAudioProcess.kill();
  }
}

function attachShellExecutionListener(context: vscode.ExtensionContext): void {
  const windowAny = vscode.window as unknown as {
    onDidEndTerminalShellExecution?: (
      listener: (event: {
        terminal: vscode.Terminal;
        exitCode?: number;
        execution?: { exitCode?: number };
      }) => void
    ) => vscode.Disposable;
  };

  if (typeof windowAny.onDidEndTerminalShellExecution !== 'function') {
    return;
  }

  const disposable = windowAny.onDidEndTerminalShellExecution((event) => {
    const explicitCode =
      typeof event.exitCode === 'number'
        ? event.exitCode
        : typeof event.execution?.exitCode === 'number'
          ? event.execution.exitCode
          : undefined;

    if (typeof explicitCode === 'number') {
      void handleOutcome(explicitCode === 0 ? 'success' : 'error', context, false, event.terminal);
    }
  });

  context.subscriptions.push(disposable);
}

function ensureTerminalState(terminal: vscode.Terminal): TerminalState {
  const existing = terminalStates.get(terminal);
  if (existing) {
    return existing;
  }

  const state: TerminalState = {
    lastTriggeredAt: 0,
  };

  terminalStates.set(terminal, state);
  return state;
}

function handleOutcome(
  outcome: Outcome,
  context: vscode.ExtensionContext,
  forcePlay: boolean,
  terminal?: vscode.Terminal
): void {
  if (!getIsEnabled(context) && !forcePlay) {
    return;
  }

  if (terminal) {
    const state = ensureTerminalState(terminal);
    const now = Date.now();

    if (
      !forcePlay &&
      state.lastTriggeredOutcome === outcome &&
      now - state.lastTriggeredAt < OUTCOME_COOLDOWN_MS
    ) {
      return;
    }

    state.lastTriggeredOutcome = outcome;
    state.lastTriggeredAt = now;
  }

  if (getBooleanSetting('enableNotifications', true)) {
    if (outcome === 'success') {
      void vscode.window.showInformationMessage('🎉 Miracle detected. Your code compiled.');
    } else {
      void vscode.window.showWarningMessage('💀 The compiler has spoken.');
    }
  }

  if (getBooleanSetting('enableSounds', true) || forcePlay) {
    const soundPath = resolveSoundPath(outcome);
    if (!soundPath) {
      void vscode.window.showWarningMessage(
        `Compile and Pray: Missing ${outcome} sound file. Configure compileAndPray.${outcome}SoundPath or add assets/${outcome}.mp3`
      );
      return;
    }

    playSound(soundPath);
  }
}

function resolveSoundPath(outcome: Outcome): string | undefined {
  const settingKey = outcome === 'success' ? 'successSoundPath' : 'errorSoundPath';
  const configuredPath = vscode.workspace.getConfiguration('compileAndPray').get<string>(settingKey, '').trim();

  if (configuredPath && fs.existsSync(configuredPath)) {
    return configuredPath;
  }

  const defaultFile = outcome === 'success' ? 'success.mp3' : 'error.mp3';
  const defaultPath = path.join(__dirname, '..', 'assets', defaultFile);
  if (fs.existsSync(defaultPath)) {
    return defaultPath;
  }

  return undefined;
}

function playSound(soundPath: string): void {
  if (activeAudioProcess && !activeAudioProcess.killed) {
    activeAudioProcess.kill();
  }

  const platform = process.platform;
  let cmd: string;
  let args: string[];

  if (platform === 'darwin') {
    cmd = 'afplay';
    args = [soundPath];
  } else if (platform === 'linux') {
    cmd = 'paplay';
    args = [soundPath];
  } else if (platform === 'win32') {
    cmd = 'powershell.exe';
    args = ['-NoProfile', '-c', `(New-Object System.Media.SoundPlayer "${soundPath}").PlaySync()`];
  } else {
    return;
  }

  activeAudioProcess = spawn(cmd, args, {
    detached: true,
    stdio: 'ignore',
  });
  activeAudioProcess.unref();
}

function getIsEnabled(context: vscode.ExtensionContext): boolean {
  return getBooleanSetting('enableSounds', true);
}

function getBooleanSetting<T extends boolean>(key: string, fallback: T): T {
  return vscode.workspace.getConfiguration('compileAndPray').get<T>(key, fallback);
}

function updateStatusBar(context: vscode.ExtensionContext): void {
  if (getIsEnabled(context)) {
    statusBarItem.text = '🙏 Compile and Pray Active';
    statusBarItem.tooltip = 'Click to disable Compile and Pray sounds';
  } else {
    statusBarItem.text = '🙏 Compile and Pray Muted';
    statusBarItem.tooltip = 'Click to enable Compile and Pray sounds';
  }
  statusBarItem.show();
}
