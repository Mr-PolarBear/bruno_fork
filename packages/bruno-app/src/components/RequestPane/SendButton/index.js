import React from 'react';
import Button from 'ui/Button';
import MenuDropdown from 'ui/MenuDropdown';
import StyledWrapper from './StyledWrapper';
import { IconChevronDown, IconSend, IconDownload } from '@tabler/icons';
import styled from 'styled-components';

const SplitTrigger = styled.button`
  display: flex;
  align-items: center;
  justify-content: center;
  width: 1.4rem;
  border: 1px solid ${(props) => props.theme.button2.color.primary.border};
  border-left: none;
  border-radius: 0 ${(props) => props.theme.border.radius.base} ${(props) => props.theme.border.radius.base} 0;
  background: ${(props) => props.theme.button2.color.primary.bg};
  color: ${(props) => props.theme.button2.color.primary.text};
  cursor: pointer;

  &:hover:not(:disabled) {
    opacity: 0.85;
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
`;

const SendButton = ({
  isLoading = false,
  disabled = false,
  onSend,
  onCancel,
  onSendAndDownload,
  testId = 'send-request-btn'
}) => {
  const menuItems = onSendAndDownload
    ? [
        { id: 'send', label: 'Send', leftSection: IconSend, onClick: onSend, testId: `${testId}-menu-send` },
        {
          id: 'send-download',
          label: 'Send and Download',
          leftSection: IconDownload,
          onClick: onSendAndDownload,
          testId: `${testId}-menu-send-download`
        }
      ]
    : null;

  return (
    <StyledWrapper className={`ml-2 ${menuItems ? 'has-split' : ''}`}>
      <Button
        size="sm"
        disabled={disabled}
        variant={isLoading ? 'outline' : 'filled'}
        color="primary"
        data-testid={testId}
        data-action={isLoading ? 'cancel' : 'send'}
        onClick={isLoading ? onCancel : onSend}
      >
        {isLoading ? 'Cancel' : 'Send'}
      </Button>
      {menuItems && !isLoading && (
        <MenuDropdown items={menuItems} placement="bottom-end" showTickMark={false}>
          <SplitTrigger
            type="button"
            disabled={disabled}
            data-testid={`${testId}-split-trigger`}
            title="More send options"
          >
            <IconChevronDown size={14} strokeWidth={2} />
          </SplitTrigger>
        </MenuDropdown>
      )}
    </StyledWrapper>
  );
};

export default SendButton;
