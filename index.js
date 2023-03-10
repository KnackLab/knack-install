#!/usr/bin/env node
require('dotenv').config();
const { spawnSync } = require('child_process');
const fs = require('fs/promises');
const { parse, basename } = require('path');
const path = require('path');
const yargs = require('yargs');
const { hideBin } = require('yargs/helpers');
const { loggerColor, logInfo } = require('./misc/logger');
const { gitHttpsClone } = require('./utils/helpers');
const repoDB = 'knack-installer-repositories.json';

// hide bin removes the first two elements in process.argv
const argv = yargs(hideBin(process.argv)) // we're passing the arguments to yargs to parse them. you can also do require('yargs/yargs')().parse([ '-x', '1', '-y', '2' ])
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
    destination: {
      alias: 'd',
      describe: 'Clone destination',
      demandOption: false,
      default: 'node_modules',
    },
    help: {
      alias: 'h',
      describe: 'Show help',
      type: 'boolean',
    },
  })
  .help().argv;

async function main() {
  try {
    logInfo(`Checking the validity of ${argv.repo}...`);
    const parsedRepoURL = new URL(argv.repo);
    // 🚩 check if url is valid,
    if (!parsedRepoURL.href.endsWith('.git')) {
      throw new Error('Invalid git repository');
    }

    const cloneDestination = path.isAbsolute(argv.destination)
      ? argv.destination
      : path.join(process.cwd(), argv.destination);

    gitHttpsClone(parsedRepoURL.href, cloneDestination);
  } catch (error) {
    logError(error);
    process.exit(1);
  }

  // naturalClone();

  function removeExistingCloneDirectory(repositoryDir) {
    // remove repository in node_module if exist
    if (fs.existsSync(repositoryDir)) {
      const result = spawnSync('rm', ['-rf', repositoryDir]);
      if (result.status !== 0) {
        console.error(
          `Error removing directory '${repositoryDir}': ${result.stderr}`
        );
        process.exit(1);
      }
    }

    // remove cloned if exist
    if (fs.existsSync(repoName)) {
      const result = spawnSync('rm', ['-rf', repoName]);
      if (result.status !== 0) {
        console.error(
          `Error removing directory '${repoName}': ${result.stderr}`
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

    updatePackageJSONPostInstallScript();
    upsertInstalledRepositories();
    createPostInstallerFile();
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
    updatePackageJSONPostInstallScript();
    upsertInstalledRepositories();
    createPostInstallerFile();
  }

  /**
   * check package.json postinstall script and add or append knack-install-postinstall-script.js
   * Such that when you run npm i, it will install the necessary repositories
   */
  function updatePackageJSONPostInstallScript() {
    const command =
      'npm i knack-install && node knack-install-postinstall-script.js';

    try {
      const packageJson = JSON.parse(fs.readFileSync('./package.json'));
      const scripts = packageJson.scripts || {};

      if (
        scripts.hasOwnProperty('postinstall') &&
        scripts.postinstall.trim() !== ''
      ) {
        if (!scripts.postinstall.includes(command)) {
          // append additional command to the existing postinstall script
          scripts.postinstall = `${command} && ${scripts.postinstall}`;
        }
      } else {
        // create postinstall script with the additional command
        scripts.postinstall = command;
      }

      fs.writeFileSync('./package.json', JSON.stringify(packageJson, null, 2));
      console.log('postinstall script updated.');
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
   * Creates knack-install-postinstall-script.js file if it does not exist
   */
  function createPostInstallerFile() {
    const fileName = 'knack-install-postinstall-script.js';

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
}

main();
