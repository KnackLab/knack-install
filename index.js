#!/usr/bin/env node
require('dotenv').config();
const { spawnSync } = require('child_process');
const fs = require('fs');
const { parse, basename } = require('path');
const repoDB = 'knack-installer-repositories.json';

const argv = require('yargs/yargs')(process.argv.slice(2))
  .usage('Usage: $0 --repo <repository-url> or $0 --repo=<repository-url>')
  .option({
    repo: {
      alias: 'r',
      describe: 'Provide a link to your repository',
      demandOption: true,
      type: 'string',
      coerce: (url) => {
        if (!url || url.trim() === '') {
          throw new Error('Repository URL cannot be empty');
        }
        return url.trim();
      },
    },
    token: {
      alias: 't',
      describe: 'Personal access token to clone private repo',
      demandOption: false,
      default: process.env.GITHUB_PAT,
    },
    help: {
      alias: 'h',
      describe: 'Show help',
      type: 'boolean',
    },
  })
  .help().argv;

const parsedUrl = parse(argv.repo);
const repoName = basename(parsedUrl.base, '.git');
const repositoryDir = `node_modules/${repoName}`;

naturalClone();

function removeExistingCloneDirectory() {
  if (fs.existsSync(repositoryDir)) {
    const result = spawnSync('rm', ['-rf', repositoryDir]);
    if (result.status !== 0) {
      console.error(
        `Error removing directory '${repositoryDir}': ${result.stderr}`
      );
      process.exit(1);
    }
  }
}

function naturalClone() {
  removeExistingCloneDirectory();

  const cloneCommand = `git clone ${argv.repo} ${repositoryDir}`;
  const installCommand = `cd node_modules/${repoName} && npm install && npm run build`;

  const commands = [cloneCommand, installCommand];
  const command = commands.join(' && ');

  const result = spawnSync(command, { shell: true, stdio: 'inherit' });
  if (result.status !== 0) {
    console.error(`Command '${command}' failed: ${result.stderr}`);
    if (argv.token) {
      cloneWithToken();
    } else {
      console.log('Consider the following options');
      console.log(
        '- Provide a token or set GITHUB_PAT={TOKEN_VALUE} in your environment'
      );
      console.log('- Make sure you have access to the repository');
      process.exit(1);
    }
  }

  updatePackageJSONPreInstallScript();
  upsertInstalledRepositories();
  createPreInstallerFile();
  console.log(`${argv.repo} cloned and added to node_modules successfully`);
}

function cloneWithToken() {
  removeExistingCloneDirectory();
  const repoGITLink = argv.repo.split('https://github.com/')[1];
  const cloneCommand = `git clone https://${argv.token}@github.com/${repoGITLink} ${repositoryDir}`;
  const installCommand = `cd node_modules/${repoName} && npm install && npm run build`;

  const commands = [cloneCommand, installCommand];
  const command = commands.join(' && ');

  const result = spawnSync(command, { shell: true, stdio: 'inherit' });
  if (result.status !== 0) {
    console.error(`Command '${command}' failed: ${result.stderr}`);
    console.log('Consider the following options');
    console.log('- Ensure you have provided a correct token');
    console.log('- Make sure you have access to the repository');
    process.exit(1);
  }

  console.log(`${argv.repo} cloned and added to node_modules successfully`);
  updatePackageJSONPreInstallScript();
  upsertInstalledRepositories();
  createPreInstallerFile();
}

/**
 * check package.json preinstall script and add or append knack-install-preinstall-script.js
 * Such that when you run npm i, it will install the necessary repositories
 */
function updatePackageJSONPreInstallScript() {
  const command =
    'npm i knack-install && node knack-install-preinstall-script.js';

  try {
    const packageJson = JSON.parse(fs.readFileSync('./package.json'));
    const scripts = packageJson.scripts || {};

    if (
      scripts.hasOwnProperty('preinstall') &&
      scripts.preinstall.trim() !== ''
    ) {
      if (!scripts.preinstall.includes(command)) {
        // append additional command to the existing preinstall script
        scripts.preinstall += ` && ${command}`;
      }
    } else {
      // create preinstall script with the additional command
      scripts.preinstall = command;
    }

    fs.writeFileSync('./package.json', JSON.stringify(packageJson, null, 2));
    console.log('Preinstall script updated.');
  } catch (err) {
    console.error('Error reading package.json file:', err);
  }
}

/**
 * Create / update a json with installed packages
 *
 * repositories: {
 *  repo1: 'repo-link', ...
 * }
 */
function upsertInstalledRepositories() {
  const upserts = { [repoName]: argv.repo };

  if (fs.existsSync(repoDB)) {
    const existingData = fs.readFileSync(repoDB);
    const existingObject = JSON.parse(existingData);
    existingObject[repoName] = argv.repo;

    const updatedData = JSON.stringify(existingObject);
    fs.writeFileSync(repoDB, updatedData);

    console.log(`File ${repoDB} updated.`);
  } else {
    const initialData = JSON.stringify(upserts);
    fs.writeFileSync(repoDB, initialData);
    console.log(`File ${repoDB} created.`);
  }
}

/**
 * Creates knack-install-preinstall-script.js file if it does not exist
 */
function createPreInstallerFile() {
  const fileName = 'knack-install-preinstall-script.js';

  if (!fs.existsSync(fileName)) {
    const fileContent = `#!/usr/bin/env node
    const fs = require('fs');
    const { spawnSync } = require('child_process');

    const data = fs.readFileSync('${repoDB}', 'utf8');
    const jsonData = JSON.parse(data);

    Object.keys(jsonData).forEach((repoKey) => {
      const repo = jsonData[repoKey]
      const command = 'npx knack-install --repo='+ repo;
      spawnSync(command, { shell: true, stdio: 'inherit' });
    });
  `;

    fs.writeFileSync(fileName, fileContent);
    fs.chmodSync(fileName, '755');
  }
}
