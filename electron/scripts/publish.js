const { spawnSync } = require('node:child_process');

function readGitHubTokenFromGhCli() {
  const ghResult = spawnSync('gh', ['auth', 'token'], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  if (ghResult.error || ghResult.status !== 0) {
    return '';
  }

  return (ghResult.stdout || '').trim();
}

function resolveGitHubToken() {
  return process.env.GH_TOKEN || process.env.GITHUB_TOKEN || readGitHubTokenFromGhCli();
}

const publishAll = process.argv.includes('--all');
const builderArgs = publishAll
  ? ['electron-builder', '--win', '--mac', '--linux', '--publish', 'always']
  : ['electron-builder', '--publish', 'always'];

const token = resolveGitHubToken();
if (!token) {
  console.error(
    'GitHub token not found. Set GH_TOKEN/GITHUB_TOKEN or sign in with "gh auth login" before publishing.',
  );
  process.exit(1);
}

const npxCommand = process.platform === 'win32' ? 'npx.cmd' : 'npx';
const publishResult = spawnSync(npxCommand, builderArgs, {
  stdio: 'inherit',
  env: {
    ...process.env,
    GH_TOKEN: token,
    GITHUB_TOKEN: token,
  },
});

if (publishResult.error) {
  console.error(publishResult.error.message);
  process.exit(1);
}

process.exit(publishResult.status || 0);
