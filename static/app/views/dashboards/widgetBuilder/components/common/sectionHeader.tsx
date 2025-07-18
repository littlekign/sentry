import styled from '@emotion/styled';

import {Tooltip} from 'sentry/components/core/tooltip';
import {t} from 'sentry/locale';
import {space} from 'sentry/styles/space';

interface SectionHeaderProps {
  title: React.ReactNode;
  className?: string;
  optional?: boolean;
  tooltipText?: React.ReactNode;
}

export function SectionHeader({
  tooltipText,
  title,
  optional,
  className,
}: SectionHeaderProps) {
  return (
    <HeaderWrapper>
      <Tooltip
        title={tooltipText}
        disabled={!tooltipText}
        position="right-end"
        delay={200}
        isHoverable
        showUnderline
      >
        <StyledHeader className={className}>{title}</StyledHeader>
      </Tooltip>
      {optional && <OptionalHeader>{t('(optional)')}</OptionalHeader>}
    </HeaderWrapper>
  );
}

const StyledHeader = styled('h6')`
  font-size: ${p => p.theme.form.md.fontSize};
  margin-bottom: ${space(0.5)};
`;

const OptionalHeader = styled('h6')`
  font-size: ${p => p.theme.form.md.fontSize};
  color: ${p => p.theme.subText};
  font-weight: ${p => p.theme.fontWeight.normal};
  margin-bottom: ${space(0.5)};
`;

const HeaderWrapper = styled('div')`
  display: flex;
  flex-direction: row;
  gap: ${space(0.5)};
`;
