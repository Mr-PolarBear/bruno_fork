const Store = require('electron-store');
const {
  getCollectionGitRootPath,
  getChangedFilesInCollectionGit,
  stageChanges,
  commitChanges,
  ensureGitUserIdentity
} = require('../../utils/git');

// Per-collection auto-commit scheduler.
// Config persists in 'git-auto-commit.json' inside Electron's userData dir so
// schedules survive app restarts; timers are (re)armed when the renderer asks
// for a collection's config (i.e. when the collection is in use).
const autoCommitStore = new Store({ name: 'git-auto-commit' });

const timers = new Map(); // collectionPath -> setInterval handle
let mainWindowRef = null;

const DEFAULT_INTERVAL_MINUTES = 30;
const MIN_INTERVAL_MINUTES = 1;
const MAX_INTERVAL_MINUTES = 24 * 60;

const storeKey = (collectionPath) => `configs.${encodeURIComponent(collectionPath)}`;

const clampInterval = (minutes) => {
  const parsed = Number(minutes);
  if (!Number.isFinite(parsed)) {
    return DEFAULT_INTERVAL_MINUTES;
  }
  return Math.min(MAX_INTERVAL_MINUTES, Math.max(MIN_INTERVAL_MINUTES, Math.round(parsed)));
};

const getConfig = (collectionPath) => {
  const stored = autoCommitStore.get(storeKey(collectionPath)) || {};
  return {
    enabled: !!stored.enabled,
    intervalMinutes: clampInterval(stored.intervalMinutes || DEFAULT_INTERVAL_MINUTES),
    lastRun: stored.lastRun || null
  };
};

const saveConfig = (collectionPath, config) => {
  autoCommitStore.set(storeKey(collectionPath), config);
};

const notifyRenderer = (collectionPath, status) => {
  try {
    mainWindowRef?.webContents?.send('main:git-auto-commit-event', { collectionPath, status });
  } catch {
    // window may already be destroyed; auto-commit still ran fine
  }
};

const buildCommitMessage = () => {
  const stamp = new Date().toISOString().replace('T', ' ').slice(0, 19);
  return `chore: auto-commit collection changes (${stamp})`;
};

const runAutoCommit = async (collectionPath) => {
  const status = { at: new Date().toISOString() };
  try {
    const gitRootPath = getCollectionGitRootPath(collectionPath);
    if (!gitRootPath) {
      throw new Error('collection is not inside a git repository');
    }

    const changed = await getChangedFilesInCollectionGit(gitRootPath, collectionPath);
    const changedCount = (changed?.staged?.length || 0) + (changed?.unstaged?.length || 0);

    if (!changedCount) {
      status.result = 'clean';
    } else {
      await ensureGitUserIdentity(gitRootPath);
      await stageChanges(gitRootPath, '-A');
      const commit = await commitChanges(gitRootPath, buildCommitMessage());
      status.result = 'committed';
      status.files = changedCount;
      status.commit = commit?.commit || null;
    }
  } catch (error) {
    status.result = 'error';
    status.error = error?.message || String(error);
  }

  const config = getConfig(collectionPath);
  config.lastRun = status;
  saveConfig(collectionPath, config);
  notifyRenderer(collectionPath, status);
  return status;
};

const clearTimer = (collectionPath) => {
  const timer = timers.get(collectionPath);
  if (timer) {
    clearInterval(timer);
    timers.delete(collectionPath);
  }
};

const armTimer = (collectionPath, intervalMinutes) => {
  clearTimer(collectionPath);
  const timer = setInterval(() => {
    runAutoCommit(collectionPath).catch(() => {});
  }, intervalMinutes * 60 * 1000);
  if (typeof timer.unref === 'function') {
    timer.unref();
  }
  timers.set(collectionPath, timer);
};

const configure = ({ collectionPath, enabled, intervalMinutes }) => {
  const config = {
    enabled: !!enabled,
    intervalMinutes: clampInterval(intervalMinutes),
    lastRun: getConfig(collectionPath).lastRun
  };
  saveConfig(collectionPath, config);

  if (config.enabled) {
    armTimer(collectionPath, config.intervalMinutes);
  } else {
    clearTimer(collectionPath);
  }

  return config;
};

// Re-arm the timer for a collection that already has auto-commit enabled.
// Called whenever the renderer resolves a collection's git config so timers
// survive restarts without needing a separate boot-time restore pass.
const resumeIfEnabled = (collectionPath) => {
  const config = getConfig(collectionPath);
  if (config.enabled && !timers.has(collectionPath)) {
    armTimer(collectionPath, config.intervalMinutes);
  }
  return config;
};

const initGitAutoCommitService = (mainWindow) => {
  mainWindowRef = mainWindow;
};

module.exports = {
  initGitAutoCommitService,
  getConfig,
  configure,
  resumeIfEnabled,
  runAutoCommit
};
