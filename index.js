#!/usr/bin/env node
require('dotenv').config();
const { spawnSync } = require('child_process');
const fs = require('fs');
const { parse, basename } = require('path');
const yargs = require('yargs/yargs');

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

  commands.forEach((command) => {
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
  });

  console.log(`${argv.repo} cloned and added to node_modules successfully`);
}

function cloneWithToken() {
  removeExistingCloneDirectory();
  const repoGITLink = argv.repo.split('https://github.com/')[1];
  const cloneCommand = `git clone https://${argv.token}@github.com/${repoGITLink} ${repositoryDir}`;
  const installCommand = `cd node_modules/${repoName} && npm install && npm run build`;

  const commands = [cloneCommand, installCommand];

  console.log(commands);

  commands.forEach((command) => {
    const result = spawnSync(command, { shell: true, stdio: 'inherit' });
    if (result.status !== 0) {
      console.error(`Command '${command}' failed: ${result.stderr}`);
      console.log('Consider the following options');
      console.log('- Ensure you have provided a correct token');
      console.log('- Make sure you have access to the repository');
      process.exit(1);
    }
  });

  console.log(`${argv.repo} cloned and added to node_modules successfully`);
}
