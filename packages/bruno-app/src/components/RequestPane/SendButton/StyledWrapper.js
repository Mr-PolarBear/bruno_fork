import styled from 'styled-components';

const StyledWrapper = styled.div`
  display: flex;
  align-self: stretch;
  min-width: 4.1rem;
  flex-shrink: 0;

  > div {
    display: flex;
    flex: 1;
  }

  button {
    height: 100%;
  }

  > div > button {
    width: 100%;
  }

  &.has-split button[data-action] {
    border-top-right-radius: 0;
    border-bottom-right-radius: 0;
  }
`;

export default StyledWrapper;
