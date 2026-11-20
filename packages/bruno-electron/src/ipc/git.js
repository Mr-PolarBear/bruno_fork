const { ipcMain } = require('electron');
const {
  cloneGitRepository,
  getCollectionGitRepoUrl,
  listBranchesForRemoteUrl,
  getCollectionGitRootPath,
  getCollectionGitData,
  getChangedFilesInCollectionGit,
  initGit,
  stageChanges,
  commitChanges,
  ensureGitUserIdentity,
  pushGitChanges,
  pullGitChanges,
  fetchChanges,
  getAheadBehindCount,
  addRemote,
  removeRemote,
  getCurrentGitBranch
} = require('../utils/git');
const { createDirectory, removeDirectory } = require('../utils/filesystem');
const gitAutoCommit = require('../services/git-auto-commit');

const getCollectionGitRemoteUrl = async (collectionPath) => {
  try {
    const url = await getCollectionGitRepoUrl(collectionPath);
    return url || null;
  } catch (error) {
    return null;
  }
};

const handleListRemoteBranches = async (event, { url }) => {
  const repositoryUrl = typeof url === 'string' ? url.trim() : '';
  if (!repositoryUrl) {
    throw new Error('Repository URL is required');
  }
  // git reads a dash-leading url as a command option, not a repository
  if (repositoryUrl.startsWith('-')) {
    throw new Error('Repository URL is not valid');
  }

  return listBranchesForRemoteUrl({ url: repositoryUrl });
};

// Resolves the git root for a collection or throws a readable error
const requireGitRootPath = (collectionPath) => {
  const gitRootPath = getCollectionGitRootPath(collectionPath);
  if (!gitRootPath) {
    throw new Error('Collection is not inside a git repository');
  }
  return gitRootPath;
};

const registerGitIpc = (mainWindow) => {
  gitAutoCommit.initGitAutoCommitService(mainWindow);

  ipcMain.handle('renderer:clone-git-repository', async (event, { url, path, processUid, branch }) => {
    let directoryCreated = false;
    try {
      await createDirectory(path);
      directoryCreated = true;
      await cloneGitRepository(mainWindow, { url, path, processUid, branch });
      return 'Repository cloned successfully';
    } catch (error) {
      if (directoryCreated) {
        await removeDirectory(path);
      }
      return Promise.reject(error);
    }
  });

  ipcMain.handle('renderer:get-collection-git-remote-url', (event, collectionPath) =>
    getCollectionGitRemoteUrl(collectionPath)
  );

  ipcMain.handle('renderer:list-remote-branches-for-url', handleListRemoteBranches);

  // ---- Collection git management (open-source Git settings panel) ----

  ipcMain.handle('renderer:git-collection-data', async (event, collectionPath) => {
    const gitRootPath = getCollectionGitRootPath(collectionPath);
    if (!gitRootPath) {
      return { isRepo: false, collectionPath };
    }
    const data = await getCollectionGitData(gitRootPath, collectionPath);
    return { isRepo: true, collectionPath, ...data };
  });

  ipcMain.handle('renderer:git-init', async (event, collectionPath) => {
    await initGit(collectionPath);
    const gitRootPath = getCollectionGitRootPath(collectionPath);
    return { isRepo: !!gitRootPath, gitRootPath };
  });

  ipcMain.handle('renderer:git-status', async (event, collectionPath) => {
    const gitRootPath = requireGitRootPath(collectionPath);
    return getChangedFilesInCollectionGit(gitRootPath, collectionPath);
  });

  ipcMain.handle('renderer:git-commit-all', async (event, { collectionPath, message }) => {
    const gitRootPath = requireGitRootPath(collectionPath);
    const commitMessage = (message || '').trim() || 'chore: update collection';
    await ensureGitUserIdentity(gitRootPath);
    await stageChanges(gitRootPath, '-A');
    return commitChanges(gitRootPath, commitMessage);
  });

  ipcMain.handle('renderer:git-push', async (event, { collectionPath, remote, processUid }) => {
    const gitRootPath = requireGitRootPath(collectionPath);
    const remoteBranch = await getCurrentGitBranch(gitRootPath);
    return pushGitChanges(mainWindow, { gitRootPath, processUid, remote: remote || 'origin', remoteBranch });
  });

  ipcMain.handle('renderer:git-pull', async (event, { collectionPath, remote, strategy, processUid }) => {
    const gitRootPath = requireGitRootPath(collectionPath);
    const remoteBranch = await getCurrentGitBranch(gitRootPath);
    return pullGitChanges(mainWindow, {
      gitRootPath,
      processUid,
      remote: remote || 'origin',
      remoteBranch,
      strategy: strategy || '--no-rebase'
    });
  });

  ipcMain.handle('renderer:git-fetch', async (event, { collectionPath, remote }) => {
    const gitRootPath = requireGitRootPath(collectionPath);
    return fetchChanges(gitRootPath, remote || 'origin');
  });

  ipcMain.handle('renderer:git-ahead-behind', async (event, collectionPath) => {
    const gitRootPath = requireGitRootPath(collectionPath);
    return getAheadBehindCount(gitRootPath);
  });

  ipcMain.handle('renderer:git-add-remote', async (event, { collectionPath, remoteName, remoteUrl }) => {
    const gitRootPath = requireGitRootPath(collectionPath);
    const url = typeof remoteUrl === 'string' ? remoteUrl.trim() : '';
    if (!url || url.startsWith('-')) {
      throw new Error('Remote URL is not valid');
    }
    return addRemote({ gitRootPath, remoteName: remoteName || 'origin', remoteUrl: url });
  });

  ipcMain.handle('renderer:git-remove-remote', async (event, { collectionPath, remoteName }) => {
    const gitRootPath = requireGitRootPath(collectionPath);
    return removeRemote({ gitRootPath, remoteName: remoteName || 'origin' });
  });

  // ---- Auto-commit scheduling ----

  ipcMain.handle('renderer:git-auto-commit-get', async (event, collectionPath) =>
    gitAutoCommit.resumeIfEnabled(collectionPath)
  );

  ipcMain.handle('renderer:git-auto-commit-set', async (event, { collectionPath, enabled, intervalMinutes }) =>
    gitAutoCommit.configure({ collectionPath, enabled, intervalMinutes })
  );

  ipcMain.handle('renderer:git-auto-commit-run-now', async (event, collectionPath) =>
    gitAutoCommit.runAutoCommit(collectionPath)
  );
};

module.exports = registerGitIpc;
module.exports.getCollectionGitRemoteUrl = getCollectionGitRemoteUrl;
module.exports.handleListRemoteBranches = handleListRemoteBranches;
