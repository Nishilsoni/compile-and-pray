# Compile and Pray

A sarcastic VS Code extension that plays dramatic sounds when your terminal either miraculously succeeds or predictably fails.

## Features

- Monitors terminal output incrementally via `onDidWriteTerminalData`
- Detects success/failure by keywords and shell exit code (when available)
- Plays success and failure sounds without blocking the VS Code UI thread
- Prevents overlapping audio (new sound interrupts current sound)
- Status bar toggle: **🙏 Compile and Pray Active** / **🙏 Compile and Pray Muted**
- Commands:
  - `Compile and Pray: Test Success Sound`
  - `Compile and Pray: Test Error Sound`
  - `Compile and Pray: Enable/Disable Sounds`

## Configuration

Settings namespace: `compileAndPray`

- `successSoundPath`: absolute path to custom success sound
- `errorSoundPath`: absolute path to custom error sound
- `enableSounds`: enable/disable audio playback
- `successKeywords`: keyword list for success detection
- `errorKeywords`: keyword list for failure detection
- `enableNotifications`: enable/disable humorous notifications

## Default assets

This project includes placeholder files at:

- `assets/success.mp3`
- `assets/error.mp3`

Replace them with your actual 20s and 5s sound files, or set absolute file paths in settings.

## Development

```bash
npm install
npm run compile
```

Press `F5` in VS Code to launch an Extension Development Host.
