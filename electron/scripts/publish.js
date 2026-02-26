const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const distDir = path.join(__dirname, '..', 'dist');
const metadataFileNames = ['latest.yml', 'latest-mac.yml', 'latest-linux.yml'];

function resolveGhCommand() {
  if (process.env.GH_CLI_PATH && fs.existsSync(process.env.GH_CLI_PATH)) {
    return process.env.GH_CLI_PATH;
  }

  const whichCommand = process.platform === 'win32' ? 'where' : 'which';
  const lookup = spawnSync(whichCommand, ['gh'], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  if (lookup.error || lookup.status !== 0) {
    return '';
  }

  const ghPath = (lookup.stdout || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find(Boolean);

  return ghPath || '';
}

function readGitHubTokenFromGhCli(ghCommand) {
  if (!ghCommand) {
    return '';
  }

  const ghResult = spawnSync(ghCommand, ['auth', 'token'], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  if (ghResult.error || ghResult.status !== 0) {
    return '';
  }

  return (ghResult.stdout || '').trim();
}

function resolveGitHubToken() {
  const explicitToken = process.env.GH_TOKEN || process.env.GITHUB_TOKEN;
  if (explicitToken) {
    return explicitToken;
  }

  return readGitHubTokenFromGhCli(resolveGhCommand());
}

function getReleaseTag() {
  if (process.env.RELEASE_TAG) {
    return process.env.RELEASE_TAG;
  }

  const packageJsonPath = path.join(__dirname, '..', 'package.json');
  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
  return `v${packageJson.version}`;
}

function getPackageVersion() {
  const packageJsonPath = path.join(__dirname, '..', 'package.json');
  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
  return packageJson.version;
}

function clearExistingMetadataFiles() {
  for (const fileName of metadataFileNames) {
    const filePath = path.join(distDir, fileName);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  }
}

function readMetadataVersion(filePath) {
  const contents = fs.readFileSync(filePath, 'utf8');
  const versionMatch = contents.match(/^version:\s*([^\s]+)$/m);
  return versionMatch ? versionMatch[1] : '';
}

function validateGeneratedMetadataFiles(expectedVersion, requireAllMetadataFiles) {
  const existingFiles = metadataFileNames
    .map((fileName) => path.join(distDir, fileName))
    .filter((filePath) => fs.existsSync(filePath));

  if (existingFiles.length === 0) {
    console.error('No latest*.yml metadata files were generated in dist/.');
    return { ok: false, metadataFiles: [] };
  }

  if (requireAllMetadataFiles && existingFiles.length !== metadataFileNames.length) {
    const missing = metadataFileNames.filter((fileName) => {
      const filePath = path.join(distDir, fileName);
      return !fs.existsSync(filePath);
    });

    console.error(`Missing update metadata files: ${missing.join(', ')}`);
    return { ok: false, metadataFiles: [] };
  }

  for (const filePath of existingFiles) {
    const metadataVersion = readMetadataVersion(filePath);
    if (!metadataVersion) {
      console.error(`Unable to read version from ${path.basename(filePath)}.`);
      return { ok: false, metadataFiles: [] };
    }

    if (metadataVersion !== expectedVersion) {
      console.error(
        `Stale metadata detected in ${path.basename(filePath)}: expected version ${expectedVersion}, found ${metadataVersion}.`,
      );
      return { ok: false, metadataFiles: [] };
    }
  }

  return { ok: true, metadataFiles: existingFiles };
}

function getReleaseArtifactFiles() {
  const allFiles = fs
    .readdirSync(distDir, { withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => path.join(distDir, entry.name));

  return allFiles.filter((filePath) => {
    const fileName = path.basename(filePath);
    if (/^latest(?:-mac|-linux)?\.yml$/i.test(fileName)) {
      return true;
    }

    if (!fileName.startsWith('wsjtx-relay-')) {
      return false;
    }

    return /\.(?:exe|dmg|zip|AppImage|snap|blockmap)$/i.test(fileName);
  });
}

function ensureReleaseExists(token, ghCommand) {
  const tag = getReleaseTag();
  // Check if release exists
  const checkResult = spawnSync(ghCommand, ['release', 'view', tag], {
    stdio: ['ignore', 'pipe', 'pipe'],
    env: {
      ...process.env,
      GH_TOKEN: token,
      GITHUB_TOKEN: token,
    },
    encoding: 'utf8',
  });
  if (checkResult.status === 0) return true;
  // Create release if missing
  const createResult = spawnSync(ghCommand, ['release', 'create', tag, '--title', tag, '--notes', 'Automated release', '--draft'], {
    stdio: 'inherit',
    env: {
      ...process.env,
      GH_TOKEN: token,
      GITHUB_TOKEN: token,
    },
  });
  return createResult.status === 0;
}

function uploadReleaseFiles(token, filesToUpload, ghCommand) {
  if (filesToUpload.length === 0) {
    console.error('No release artifact files found in dist/ to upload.');
    return 1;
  }

  if (!ensureReleaseExists(token, ghCommand)) {
    console.error('Failed to create or find GitHub release.');
    return 1;
  }

  const ghArgs = ['release', 'upload', getReleaseTag(), ...filesToUpload, '--clobber'];

  const uploadResult = spawnSync(ghCommand, ghArgs, {
    stdio: 'inherit',
    env: {
      ...process.env,
      GH_TOKEN: token,
      GITHUB_TOKEN: token,
    },
  });

  if (uploadResult.error) {
    console.error(uploadResult.error.message);
    return 1;
  }

  return uploadResult.status || 0;
}

const publishAll = process.argv.includes('--all');
const builderArgs = publishAll
  ? ['electron-builder', '--win', '--mac', '--linux', '--publish', 'never']
  : ['electron-builder', '--publish', 'never'];

const ghCommand = resolveGhCommand();
if (!ghCommand) {
  console.error(
    'GitHub CLI (gh) not found in PATH. Install gh or set GH_CLI_PATH (example: /opt/homebrew/bin/gh).',
  );
  process.exit(1);
}

const token = resolveGitHubToken();
if (!token) {
  console.error(
    'GitHub token not found. Set GH_TOKEN/GITHUB_TOKEN, or ensure gh is installed and authenticated with "gh auth login".',
  );
  process.exit(1);
}

clearExistingMetadataFiles();

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

if ((publishResult.status || 0) !== 0) {
  process.exit(publishResult.status || 1);
}

const metadataValidationResult = validateGeneratedMetadataFiles(getPackageVersion(), publishAll);
if (!metadataValidationResult.ok) {
  process.exit(1);
}

const releaseArtifactFiles = getReleaseArtifactFiles();
const uploadStatus = uploadReleaseFiles(token, releaseArtifactFiles, ghCommand);
if (uploadStatus !== 0) {
  process.exit(uploadStatus);
}

process.exit(0);
