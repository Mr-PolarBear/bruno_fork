import styled from 'styled-components';

const StyledWrapper = styled.div`
  .git-settings {
    max-width: 640px;
    font-size: ${(props) => props.theme.font.size.base};
    color: ${(props) => props.theme.text};
  }

  .hint {
    font-size: ${(props) => props.theme.font.size.sm};
    color: ${(props) => props.theme.colors.text.muted};
  }

  .section {
    margin-bottom: 1.5rem;
    padding-bottom: 1.5rem;
    border-bottom: solid 1px ${(props) => props.theme.sidebar.collection.item.hoverBg};
  }

  .section:last-child {
    border-bottom: none;
  }

  .section-title {
    font-weight: 600;
    margin-bottom: 0.5rem;
  }

  .textbox {
    width: 100%;
    min-width: 0;
    height: 34px;
    padding: 0 10px;
    border-radius: ${(props) => props.theme.border.radius.sm};
    border: 1px solid ${(props) => props.theme.input.border};
    background-color: ${(props) => props.theme.input.bg};
    color: ${(props) => props.theme.text};
    box-shadow: none;
    outline: none;
  }

  .textbox:focus {
    border: solid 1px ${(props) => props.theme.input.focusBorder} !important;
    outline: none !important;
  }

  textarea.textbox {
    height: auto;
    min-height: 60px;
    padding: 8px 10px;
    resize: vertical;
  }

  .repo-meta {
    display: grid;
    grid-template-columns: 110px 1fr;
    row-gap: 4px;
    font-size: ${(props) => props.theme.font.size.sm};
  }

  .repo-meta .label {
    color: ${(props) => props.theme.colors.text.muted};
  }

  .file-list {
    max-height: 200px;
    overflow-y: auto;
    border: 1px solid ${(props) => props.theme.input.border};
    border-radius: ${(props) => props.theme.border.radius.sm};
    font-size: ${(props) => props.theme.font.size.sm};
  }

  .file-row {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 4px 10px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .file-row + .file-row {
    border-top: 1px solid ${(props) => props.theme.sidebar.collection.item.hoverBg};
  }

  .file-badge {
    flex-shrink: 0;
    min-width: 18px;
    text-align: center;
    font-weight: 600;
  }

  .file-badge.modified {
    color: #d97706;
  }

  .file-badge.added {
    color: #16a34a;
  }

  .file-badge.deleted {
    color: #dc2626;
  }

  .file-badge.renamed {
    color: #2563eb;
  }

  .commit-list {
    font-size: ${(props) => props.theme.font.size.sm};
  }

  .commit-row {
    display: flex;
    gap: 8px;
    padding: 4px 0;
    align-items: baseline;
  }

  .commit-hash {
    font-family: monospace;
    color: ${(props) => props.theme.colors.text.muted};
    flex-shrink: 0;
  }

  .commit-message {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .commit-date {
    margin-left: auto;
    flex-shrink: 0;
    color: ${(props) => props.theme.colors.text.muted};
  }

  .auto-commit-status {
    font-size: ${(props) => props.theme.font.size.sm};
    margin-top: 6px;
  }

  .auto-commit-status.error {
    color: #dc2626;
  }

  .auto-commit-status.ok {
    color: #16a34a;
  }
`;

export default StyledWrapper;
