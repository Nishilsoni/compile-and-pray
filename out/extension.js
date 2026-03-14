"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.activate = activate;
exports.deactivate = deactivate;
const path = __importStar(require("path"));
const fs = __importStar(require("fs"));
const vscode = __importStar(require("vscode"));
const child_process_1 = require("child_process");
const OUTCOME_COOLDOWN_MS = 3000;
let statusBarItem;
let activeAudioProcess;
const terminalStates = new Map();
function activate(context) {
    statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
    statusBarItem.command = 'compileAndPray.toggleSounds';
    context.subscriptions.push(statusBarItem);
    updateStatusBar(context);
    for (const terminal of vscode.window.terminals) {
        ensureTerminalState(terminal);
    }
    context.subscriptions.push(vscode.commands.registerCommand('compileAndPray.testSuccessSound', () => {
        handleOutcome('success', context, true);
    }), vscode.commands.registerCommand('compileAndPray.testErrorSound', () => {
        handleOutcome('error', context, true);
    }), vscode.commands.registerCommand('compileAndPray.toggleSounds', async () => {
        const enabled = getIsEnabled(context);
        await vscode.workspace
            .getConfiguration('compileAndPray')
            .update('enableSounds', !enabled, vscode.ConfigurationTarget.Global);
        updateStatusBar(context);
        vscode.window.showInformationMessage(!enabled ? '🙏 Compile and Pray enabled.' : '🙏 Compile and Pray muted.');
    }), vscode.workspace.onDidChangeConfiguration((event) => {
        if (event.affectsConfiguration('compileAndPray')) {
            updateStatusBar(context);
        }
    }), vscode.window.onDidOpenTerminal((terminal) => {
        ensureTerminalState(terminal);
    }), vscode.window.onDidCloseTerminal((terminal) => {
        terminalStates.delete(terminal);
        const exitCode = terminal.exitStatus?.code;
        if (typeof exitCode === 'number') {
            void handleOutcome(exitCode === 0 ? 'success' : 'error', context, false, terminal);
        }
    }));
    attachShellExecutionListener(context);
}
function deactivate() {
    if (activeAudioProcess && !activeAudioProcess.killed) {
        activeAudioProcess.kill();
    }
}
function attachShellExecutionListener(context) {
    const windowAny = vscode.window;
    if (typeof windowAny.onDidEndTerminalShellExecution !== 'function') {
        return;
    }
    const disposable = windowAny.onDidEndTerminalShellExecution((event) => {
        const explicitCode = typeof event.exitCode === 'number'
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
function ensureTerminalState(terminal) {
    const existing = terminalStates.get(terminal);
    if (existing) {
        return existing;
    }
    const state = {
        lastTriggeredAt: 0,
    };
    terminalStates.set(terminal, state);
    return state;
}
function handleOutcome(outcome, context, forcePlay, terminal) {
    if (!getIsEnabled(context) && !forcePlay) {
        return;
    }
    if (terminal) {
        const state = ensureTerminalState(terminal);
        const now = Date.now();
        if (!forcePlay &&
            state.lastTriggeredOutcome === outcome &&
            now - state.lastTriggeredAt < OUTCOME_COOLDOWN_MS) {
            return;
        }
        state.lastTriggeredOutcome = outcome;
        state.lastTriggeredAt = now;
    }
    if (getBooleanSetting('enableNotifications', true)) {
        if (outcome === 'success') {
            void vscode.window.showInformationMessage('🎉 Miracle detected. Your code compiled.');
        }
        else {
            void vscode.window.showWarningMessage('💀 The compiler has spoken.');
        }
    }
    if (getBooleanSetting('enableSounds', true) || forcePlay) {
        const soundPath = resolveSoundPath(outcome);
        if (!soundPath) {
            void vscode.window.showWarningMessage(`Compile and Pray: Missing ${outcome} sound file. Configure compileAndPray.${outcome}SoundPath or add assets/${outcome}.mp3`);
            return;
        }
        playSound(soundPath);
    }
}
function resolveSoundPath(outcome) {
    const settingKey = outcome === 'success' ? 'successSoundPath' : 'errorSoundPath';
    const configuredPath = vscode.workspace.getConfiguration('compileAndPray').get(settingKey, '').trim();
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
function playSound(soundPath) {
    if (activeAudioProcess && !activeAudioProcess.killed) {
        activeAudioProcess.kill();
    }
    const platform = process.platform;
    let cmd;
    let args;
    if (platform === 'darwin') {
        cmd = 'afplay';
        args = [soundPath];
    }
    else if (platform === 'linux') {
        cmd = 'paplay';
        args = [soundPath];
    }
    else if (platform === 'win32') {
        cmd = 'powershell.exe';
        args = ['-NoProfile', '-c', `(New-Object System.Media.SoundPlayer "${soundPath}").PlaySync()`];
    }
    else {
        return;
    }
    activeAudioProcess = (0, child_process_1.spawn)(cmd, args, {
        detached: true,
        stdio: 'ignore',
    });
    activeAudioProcess.unref();
}
function getIsEnabled(context) {
    return getBooleanSetting('enableSounds', true);
}
function getBooleanSetting(key, fallback) {
    return vscode.workspace.getConfiguration('compileAndPray').get(key, fallback);
}
function updateStatusBar(context) {
    if (getIsEnabled(context)) {
        statusBarItem.text = '🙏 Compile and Pray Active';
        statusBarItem.tooltip = 'Click to disable Compile and Pray sounds';
    }
    else {
        statusBarItem.text = '🙏 Compile and Pray Muted';
        statusBarItem.tooltip = 'Click to enable Compile and Pray sounds';
    }
    statusBarItem.show();
}
//# sourceMappingURL=extension.js.map