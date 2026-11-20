import React, { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import Button from 'ui/Button';
import Checkbox from 'ui/Checkbox';
import SettingsHeader from '../SettingsHeader';
import StyledWrapper from './StyledWrapper';
import { uuid } from 'utils/common';

const fileBadgeClass = (file) => {
  const code = file.type === 'renamed' ? 'R' : file.working_dir === '?' || file.index === '?' ? 'A' : file.index || file.working_dir || 'M';
  if (code === 'D' || file.working_dir === 'D') return { cls: 'deleted', label: 'D' };
  if (code === 'A' || code === '?') return { cls: 'added', label: 'A' };
  if (code === 'R') return { cls: 'renamed', label: 'R' };
  return { cls: 'modified', label: 'M' };
};

const formatDate = (iso) => {
  if (!iso) return '';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleString();
};

const GitSettings = ({ collection }) => {
  const collectionPath = collection?.pathname;
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [gitData, setGitData] = useState(null);
  const [status, setStatus] = useState(null);
  const [aheadBehind, setAheadBehind] = useState(null);
  const [commitMessage, setCommitMessage] = useState('');
  const [remoteDraft, setRemoteDraft] = useState('');
  const [autoConfig, setAutoConfig] = useState({ enabled: false, intervalMinutes: 30, lastRun: null });

  const invoke = useCallback((channel, ...args) => window.ipcRenderer.invoke(channel, ...args), []);

  const refresh = useCallback(async () => {
    if (!collectionPath) return;
    const data = await invoke('renderer:git-collection-data', collectionPath);
    setGitData(data);
    if (data?.isRepo) {
      const [statusResult, ab, cfg] = await Promise.all([
        invoke('renderer:git-status', collectionPath).catch(() => null),
        invoke('renderer:git-ahead-behind', collectionPath).catch(() => null),
        invoke('renderer:git-auto-commit-get', collectionPath).catch(() => null)
      ]);
      setStatus(statusResult);
      setAheadBehind(ab);
      if (cfg) setAutoConfig(cfg);
    }
    setLoading(false);
  }, [collectionPath, invoke]);

  useEffect(() => {
    setLoading(true);
    refresh().catch((err) => {
      setLoading(false);
      toast.error(err?.message || 'Failed to load git info');
    });
  }, [refresh]);

  // Live-update when an auto-commit run finishes while this panel is open
  useEffect(() => {
    if (!window.ipcRenderer?.on) return undefined;
    const unsubscribe = window.ipcRenderer.on('main:git-auto-commit-event', (payload) => {
      if (payload?.collectionPath !== collectionPath) return;
      setAutoConfig((prev) => ({ ...prev, lastRun: payload.status }));
      refresh().catch(() => {});
    });
    return unsubscribe;
  }, [collectionPath, refresh]);

  const runAction = async (fn, successMessage) => {
    setBusy(true);
    try {
      const result = await fn();
      if (successMessage) toast.success(successMessage);
      await refresh();
      return result;
    } catch (err) {
      toast.error(err?.message || 'Git operation failed');
    } finally {
      setBusy(false);
    }
  };

  const handleInit = () => runAction(() => invoke('renderer:git-init', collectionPath), 'Git repository initialized');

  const handleCommit = () =>
    runAction(async () => {
      await invoke('renderer:git-commit-all', { collectionPath, message: commitMessage });
      setCommitMessage('');
    }, 'Changes committed');

  const handlePush = () =>
    runAction(() => invoke('renderer:git-push', { collectionPath, remote: 'origin', processUid: uuid() }), 'Pushed to origin');

  const handlePull = () =>
    runAction(
      () => invoke('renderer:git-pull', { collectionPath, remote: 'origin', strategy: '--no-rebase', processUid: uuid() }),
      'Pulled latest changes'
    );

  const handleFetch = () =>
    runAction(() => invoke('renderer:git-fetch', { collectionPath, remote: 'origin' }), 'Fetched remote changes');

  const handleAddRemote = () =>
    runAction(async () => {
      await invoke('renderer:git-add-remote', { collectionPath, remoteName: 'origin', remoteUrl: remoteDraft });
      setRemoteDraft('');
    }, 'Remote added');

  const handleAutoCommitSave = (next) =>
    runAction(async () => {
      const cfg = await invoke('renderer:git-auto-commit-set', {
        collectionPath,
        enabled: next.enabled,
        intervalMinutes: next.intervalMinutes
      });
      setAutoConfig(cfg);
    }, 'Auto-commit settings saved');

  const handleRunNow = () =>
    runAction(async () => {
      const result = await invoke('renderer:git-auto-commit-run-now', collectionPath);
      setAutoConfig((prev) => ({ ...prev, lastRun: result }));
    }, null);

  const changedFiles = status ? [...(status.unstaged || []), ...(status.staged || []), ...(status.conflicted || [])] : [];

  const renderLastRun = () => {
    const lastRun = autoConfig?.lastRun;
    if (!lastRun) return null;
    if (lastRun.result === 'error') {
      return <div className="auto-commit-status error">Last run failed: {lastRun.error}</div>;
    }
    const text = lastRun.result === 'committed'
      ? `Committed ${lastRun.files} file(s) at ${formatDate(lastRun.at)}`
      : `No changes to commit at ${formatDate(lastRun.at)}`;
    return <div className="auto-commit-status ok">{text}</div>;
  };

  return (
    <StyledWrapper>
      <div className="git-settings">
        <SettingsHeader title="Git" description="Version this collection with git — commit, sync and schedule auto-commits." />

        {loading && <div className="hint">Loading git information…</div>}

        {!loading && gitData && !gitData.isRepo && (
          <div className="section">
            <div className="hint" style={{ marginBottom: 8 }}>
              This collection is not inside a git repository yet.
            </div>
            <Button type="button" size="sm" disabled={busy} onClick={handleInit}>
              Initialize Git Repository
            </Button>
          </div>
        )}

        {!loading && gitData?.isRepo && (
          <>
            <div className="section">
              <div className="section-title">Repository</div>
              <div className="repo-meta">
                <span className="label">Branch</span>
                <span>{gitData.currentGitBranch || '(detached)'}</span>
                <span className="label">Remote</span>
                <span>{gitData.gitRepoUrl || 'Not configured'}</span>
                <span className="label">Ahead / Behind</span>
                <span>
                  {aheadBehind ? `+${aheadBehind.ahead} / -${aheadBehind.behind}` : 'n/a'}
                </span>
              </div>
              <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                <Button type="button" size="sm" color="secondary" disabled={busy} onClick={handleFetch}>Fetch</Button>
                <Button type="button" size="sm" color="secondary" disabled={busy || !gitData.gitRepoUrl} onClick={handlePull}>Pull</Button>
                <Button type="button" size="sm" color="secondary" disabled={busy || !gitData.gitRepoUrl} onClick={handlePush}>Push</Button>
              </div>
              {!gitData.gitRepoUrl && (
                <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                  <input
                    className="textbox"
                    placeholder="Remote URL (e.g. http://git.internal/team/apis.git)"
                    value={remoteDraft}
                    onChange={(e) => setRemoteDraft(e.target.value)}
                  />
                  <Button type="button" size="sm" disabled={busy || !remoteDraft.trim()} onClick={handleAddRemote}>
                    Add origin
                  </Button>
                </div>
              )}
            </div>

            <div className="section">
              <div className="section-title">
                Changes {status ? `(${changedFiles.length})` : ''}
              </div>
              {status?.tooManyFiles && (
                <div className="hint" style={{ marginBottom: 6 }}>
                  Too many changed files ({status.totalFiles}) to list — commit will still include all of them.
                </div>
              )}
              {changedFiles.length > 0 ? (
                <div className="file-list">
                  {changedFiles.map((file) => {
                    const badge = fileBadgeClass(file);
                    return (
                      <div className="file-row" key={`${file.type}-${file.path}`}>
                        <span className={`file-badge ${badge.cls}`}>{badge.label}</span>
                        <span title={file.path}>{file.path}</span>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="hint">Working tree clean — nothing to commit.</div>
              )}
              <textarea
                className="textbox"
                style={{ marginTop: 10 }}
                placeholder="Commit message (optional)"
                value={commitMessage}
                onChange={(e) => setCommitMessage(e.target.value)}
              />
              <div style={{ marginTop: 8 }}>
                <Button type="button" size="sm" disabled={busy || changedFiles.length === 0} onClick={handleCommit}>
                  Commit All Changes
                </Button>
              </div>
            </div>

            <div className="section">
              <div className="section-title">Auto-commit</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <Checkbox
                  checked={autoConfig.enabled}
                  onChange={(e) => handleAutoCommitSave({ ...autoConfig, enabled: e.target.checked })}
                  disabled={busy}
                />
                <span>Automatically commit collection changes every</span>
                <input
                  className="textbox"
                  style={{ width: 70 }}
                  type="number"
                  min="1"
                  max="1440"
                  value={autoConfig.intervalMinutes}
                  onChange={(e) => setAutoConfig((prev) => ({ ...prev, intervalMinutes: e.target.value }))}
                  onBlur={() => handleAutoCommitSave(autoConfig)}
                />
                <span>minutes</span>
              </div>
              <div style={{ marginTop: 8, display: 'flex', gap: 8 }}>
                <Button type="button" size="sm" color="secondary" disabled={busy} onClick={handleRunNow}>
                  Run now
                </Button>
              </div>
              {renderLastRun()}
            </div>

            {Array.isArray(gitData.logs) && gitData.logs.length > 0 && (
              <div className="section">
                <div className="section-title">Recent commits</div>
                <div className="commit-list">
                  {gitData.logs.slice(0, 15).map((log) => (
                    <div className="commit-row" key={log.hash}>
                      <span className="commit-hash">{log.hash.slice(0, 8)}</span>
                      <span className="commit-message" title={log.message}>{log.message}</span>
                      <span className="commit-date">{formatDate(log.date)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </StyledWrapper>
  );
};

export default GitSettings;
