import {Fragment} from 'react';
import styled from '@emotion/styled';

import IssueStreamHeaderLabel from 'sentry/components/IssueStreamHeaderLabel';
import ToolbarHeader from 'sentry/components/toolbarHeader';
import {t} from 'sentry/locale';
import {space} from 'sentry/styles/space';
import type {PageFilters} from 'sentry/types/core';
import useOrganization from 'sentry/utils/useOrganization';
import {COLUMN_BREAKPOINTS} from 'sentry/views/issueList/actions/utils';

type Props = {
  isReprocessingQuery: boolean;
  onSelectStatsPeriod: (statsPeriod: string) => void;
  selection: PageFilters;
  statsPeriod: string;
  isSavedSearchesOpen?: boolean;
};

function Headers({
  selection,
  statsPeriod,
  onSelectStatsPeriod,
  isReprocessingQuery,
  isSavedSearchesOpen,
}: Props) {
  const organization = useOrganization();

  return (
    <Fragment>
      {isReprocessingQuery ? (
        <Fragment>
          <StartedColumn>{t('Started')}</StartedColumn>
          <EventsReprocessedColumn>{t('Events Reprocessed')}</EventsReprocessedColumn>
          <ProgressColumn>{t('Progress')}</ProgressColumn>
        </Fragment>
      ) : (
        <Fragment>
          {organization.features.includes('issue-stream-table-layout') ? (
            <Fragment>
              <LastSeenLabel breakpoint={COLUMN_BREAKPOINTS.LAST_SEEN} align="right">
                {t('Last Seen')}
              </LastSeenLabel>
              <FirstSeenLabel breakpoint={COLUMN_BREAKPOINTS.FIRST_SEEN} align="right">
                {t('Age')}
              </FirstSeenLabel>
            </Fragment>
          ) : null}
          {organization.features.includes('issue-stream-table-layout') ? (
            <NarrowGraphLabel breakpoint={COLUMN_BREAKPOINTS.TREND}>
              <NarrowGraphLabelContents>
                {t('Trend')}
                <NarrowGraphToggles>
                  {selection.datetime.period !== '24h' && (
                    <GraphToggle
                      active={statsPeriod === '24h'}
                      onClick={() => onSelectStatsPeriod('24h')}
                    >
                      {t('24h')}
                    </GraphToggle>
                  )}
                  <GraphToggle
                    active={statsPeriod === 'auto'}
                    onClick={() => onSelectStatsPeriod('auto')}
                  >
                    {selection.datetime.period || t('Custom')}
                  </GraphToggle>
                </NarrowGraphToggles>
              </NarrowGraphLabelContents>
            </NarrowGraphLabel>
          ) : (
            <GraphHeaderWrapper isSavedSearchesOpen={isSavedSearchesOpen}>
              <GraphHeader>
                <StyledToolbarHeader>{t('Graph:')}</StyledToolbarHeader>
                {selection.datetime.period !== '24h' && (
                  <GraphToggle
                    active={statsPeriod === '24h'}
                    onClick={() => onSelectStatsPeriod('24h')}
                  >
                    {t('24h')}
                  </GraphToggle>
                )}
                <GraphToggle
                  active={statsPeriod === 'auto'}
                  onClick={() => onSelectStatsPeriod('auto')}
                >
                  {selection.datetime.period || t('Custom')}
                </GraphToggle>
              </GraphHeader>
            </GraphHeaderWrapper>
          )}
          {organization.features.includes('issue-stream-table-layout') ? (
            <Fragment>
              <NarrowEventsOrUsersLabel
                breakpoint={COLUMN_BREAKPOINTS.EVENTS}
                align="right"
              >
                {t('Events')}
              </NarrowEventsOrUsersLabel>
              <NarrowEventsOrUsersLabel
                breakpoint={COLUMN_BREAKPOINTS.USERS}
                align="right"
              >
                {t('Users')}
              </NarrowEventsOrUsersLabel>
              <NarrowPriorityLabel breakpoint={COLUMN_BREAKPOINTS.PRIORITY} align="left">
                {t('Priority')}
              </NarrowPriorityLabel>
              <NarrowAssigneeLabel breakpoint={COLUMN_BREAKPOINTS.ASSIGNEE} align="right">
                {t('Assignee')}
              </NarrowAssigneeLabel>
            </Fragment>
          ) : (
            <Fragment>
              <EventsOrUsersLabel>{t('Events')}</EventsOrUsersLabel>
              <EventsOrUsersLabel>{t('Users')}</EventsOrUsersLabel>
              <PriorityLabel isSavedSearchesOpen={isSavedSearchesOpen}>
                <ToolbarHeader>{t('Priority')}</ToolbarHeader>
              </PriorityLabel>
              <AssigneeLabel isSavedSearchesOpen={isSavedSearchesOpen}>
                <ToolbarHeader>{t('Assignee')}</ToolbarHeader>
              </AssigneeLabel>
            </Fragment>
          )}
        </Fragment>
      )}
    </Fragment>
  );
}

export default Headers;

const GraphHeaderWrapper = styled('div')<{isSavedSearchesOpen?: boolean}>`
  width: 180px;

  @media (max-width: ${p =>
      p.isSavedSearchesOpen ? p.theme.breakpoints.xlarge : p.theme.breakpoints.large}) {
    display: none;
  }
`;

const NarrowGraphLabel = styled(IssueStreamHeaderLabel)`
  width: 175px;
  flex: 1;
  display: flex;
  justify-content: space-between;
  padding: 0;
`;

const NarrowGraphLabelContents = styled('div')`
  display: flex;
  flex: 1;
  justify-content: space-between;
`;

const NarrowGraphToggles = styled('div')`
  font-weight: ${p => p.theme.fontWeightNormal};
  margin-right: ${space(2)};
`;

const GraphHeader = styled('div')`
  display: flex;
  margin-right: ${space(1.5)};
`;

const StyledToolbarHeader = styled(ToolbarHeader)`
  flex: 1;
`;

const GraphToggle = styled('a')<{active: boolean}>`
  font-size: 13px;
  padding-left: ${space(1)};

  &,
  &:hover,
  &:focus,
  &:active {
    color: ${p => (p.active ? p.theme.textColor : p.theme.disabled)};
  }
`;

const LastSeenLabel = styled(IssueStreamHeaderLabel)`
  width: 86px;
`;

const FirstSeenLabel = styled(IssueStreamHeaderLabel)`
  width: 50px;
`;

const EventsOrUsersLabel = styled(ToolbarHeader)`
  display: inline-grid;
  align-items: center;
  justify-content: flex-end;
  text-align: right;
  width: 60px;
  margin: 0 ${space(2)};

  @media (min-width: ${p => p.theme.breakpoints.xlarge}) {
    width: 80px;
  }
`;

const NarrowEventsOrUsersLabel = styled(IssueStreamHeaderLabel)`
  width: 60px;

  @media (max-width: ${p => p.theme.breakpoints.medium}) {
    display: none;
  }
`;

const PriorityLabel = styled(ToolbarHeader)<{isSavedSearchesOpen?: boolean}>`
  justify-content: flex-end;
  text-align: right;
  width: 70px;
  margin: 0 ${space(2)};

  @media (max-width: ${p =>
      p.isSavedSearchesOpen ? p.theme.breakpoints.large : p.theme.breakpoints.medium}) {
    display: none;
  }
`;

const NarrowPriorityLabel = styled(IssueStreamHeaderLabel)`
  width: 64px;
`;

const AssigneeLabel = styled(ToolbarHeader)<{isSavedSearchesOpen?: boolean}>`
  justify-content: flex-end;
  text-align: right;
  width: 60px;
  margin-left: ${space(2)};
  margin-right: ${space(2)};

  @media (max-width: ${p =>
      p.isSavedSearchesOpen ? p.theme.breakpoints.large : p.theme.breakpoints.medium}) {
    display: none;
  }
`;

export const NarrowAssigneeLabel = styled(IssueStreamHeaderLabel)`
  width: 66px;
`;

// Reprocessing
const StartedColumn = styled(ToolbarHeader)`
  margin: 0 ${space(2)};
  ${p => p.theme.overflowEllipsis};
  width: 85px;

  @media (min-width: ${p => p.theme.breakpoints.small}) {
    width: 140px;
  }
`;

const EventsReprocessedColumn = styled(ToolbarHeader)`
  margin: 0 ${space(2)};
  ${p => p.theme.overflowEllipsis};
  width: 75px;

  @media (min-width: ${p => p.theme.breakpoints.small}) {
    width: 140px;
  }
`;

const ProgressColumn = styled(ToolbarHeader)`
  margin: 0 ${space(2)};

  display: none;

  @media (min-width: ${p => p.theme.breakpoints.small}) {
    display: block;
    width: 160px;
  }
`;
