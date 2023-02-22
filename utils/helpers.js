const { spawnSync } = require("child_process");

/**
 *
 * @param {string} repo path to the repo
 * @param {string} cloneDist clone destination path
 */

function githubClone(repo, cloneDist) {
  const cloneCommand = `git clone ${repo} ${cloneDist}`;
  const result = spawnSync(cloneCommand, { stdio: "inherit", shell: true });
}

module.exports = {
  githubClone,
};
