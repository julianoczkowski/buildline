// The one sound Buildline makes: a short chime when a feature needs a person or
// ships. Plays the system's own notification sound where there is one, and falls
// back to the terminal bell. Off with `"sound": false` in buildline.json.
import fs from 'node:fs';
import { spawn } from 'node:child_process';

const PLAYERS = {
  darwin: ['afplay', '/System/Library/Sounds/Glass.aiff'],
  linux: ['paplay', '/usr/share/sounds/freedesktop/stereo/complete.oga'],
};

let last = 0;

export function chime(out = process.stdout) {
  if (Date.now() - last < 3000) return; // several features at once still make one sound
  last = Date.now();
  const bell = () => out.write('\x07');
  const player = PLAYERS[process.platform];
  if (!player || !fs.existsSync(player[1])) return bell();
  try {
    const child = spawn(player[0], [player[1]], { stdio: 'ignore', detached: true });
    child.on('error', bell);
    child.unref();
  } catch {
    bell();
  }
}

export const soundOn = (config) => config?.sound !== false;
