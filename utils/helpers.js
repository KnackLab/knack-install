const { spawnSync } = require("child_process");
const fsPromises = require("fs/promises");
const path = require("path");
const { logError, logInfo, logSuccess } = require("../misc/logger");

/**
 *
 * @param {string} remoteRepoHref path to the repo
 * @param {string} cloneDestination clone destination path
 */

async function gitHttpsClone(remoteRepoHref, cloneDestination) {
  const repoName = path.parse(remoteRepoHref).name;

  await removeExistingCloneDirectory(path.join(cloneDestination, repoName));
  // logInfo(`cloning into ${repositoryDir}`);
  const cloneCommand = `cd ${cloneDestination} && git clone ${remoteRepoHref} --verbose`;
  const result = spawnSync(cloneCommand, { stdio: "inherit", shell: true });
  logSuccess(`Successfully cloned`);
}

async function removeExistingCloneDirectory(repositoryDir) {
  // remove repository in node_module if exist
  logInfo(`Checking if the repo exists in ${repositoryDir}`);

  try {
    await fsPromises.access(repositoryDir);
    logInfo(`Repo exists in ${repositoryDir}`);
    const result = spawnSync("rm", ["-rf", repositoryDir]);
    logSuccess(`Removed existing repo`);

    if (result.status !== 0) {
      logError(new Error(`There was an error removing ${repositoryDir}`));
      process.exit(result.status);
    }
  } catch (error) {
    logInfo(`Repo does not exist in ${repositoryDir}`);
    return;
  }
  // if (result.status !== 0) {
  //   console.error(
  //     `Error removing directory '${repositoryDir}': ${result.stderr}`
  //   );
  //   process.exit(1);
  // }
  // if (fs.existsSync(repositoryDir)) {
  // }

  // remove cloned if exist
  // if (fs.existsSync(repoName)) {
  //   const result = spawnSync("rm", ["-rf", repoName]);
  //   if (result.status !== 0) {
  //     console.error(`Error removing directory '${repoName}': ${result.stderr}`);
  //     process.exit(1);
  //   }
  // }
}

module.exports = {
  gitHttpsClone,
};
