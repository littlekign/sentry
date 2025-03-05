import {Fragment, useCallback, useMemo} from 'react';
import {css, useTheme} from '@emotion/react';
import styled from '@emotion/styled';
import type {Location} from 'history';
import pick from 'lodash/pick';

import type {Client} from 'sentry/api';
import Feature from 'sentry/components/acl/feature';
import {type Fidelity, getInterval} from 'sentry/components/charts/utils';
import GroupList from 'sentry/components/issues/groupList';
import * as Layout from 'sentry/components/layouts/thirds';
import Link from 'sentry/components/links/link';
import {NoAccess} from 'sentry/components/noAccess';
import {DatePageFilter} from 'sentry/components/organizations/datePageFilter';
import {EnvironmentPageFilter} from 'sentry/components/organizations/environmentPageFilter';
import PageFilterBar from 'sentry/components/organizations/pageFilterBar';
import {normalizeDateTimeParams} from 'sentry/components/organizations/pageFilters/parse';
import {ProjectPageFilter} from 'sentry/components/organizations/projectPageFilter';
import Panel from 'sentry/components/panels/panel';
import PanelBody from 'sentry/components/panels/panelBody';
import PanelHeader from 'sentry/components/panels/panelHeader';
import {PanelTable} from 'sentry/components/panels/panelTable';
import TransactionNameSearchBar from 'sentry/components/performance/searchBar';
import Placeholder from 'sentry/components/placeholder';
import {Tooltip} from 'sentry/components/tooltip';
import {DEFAULT_RELATIVE_PERIODS, DEFAULT_STATS_PERIOD} from 'sentry/constants';
import {CHART_PALETTE} from 'sentry/constants/chartPalette';
import {URL_PARAM} from 'sentry/constants/pageFilters';
import {IconArrow, IconUser} from 'sentry/icons';
import {t, tct} from 'sentry/locale';
import {space} from 'sentry/styles/space';
import type {
  EventsStats,
  MultiSeriesEventsStats,
  Organization,
} from 'sentry/types/organization';
import type {EventsMetaType} from 'sentry/utils/discover/eventView';
import getDuration from 'sentry/utils/duration/getDuration';
import {parsePeriodToHours} from 'sentry/utils/duration/parsePeriodToHours';
import {formatAbbreviatedNumber} from 'sentry/utils/formatters';
import {canUseMetricsData} from 'sentry/utils/performance/contexts/metricsEnhancedSetting';
import {PerformanceDisplayProvider} from 'sentry/utils/performance/contexts/performanceDisplayContext';
import {useApiQuery} from 'sentry/utils/queryClient';
import {decodeScalar} from 'sentry/utils/queryString';
import {MutableSearch} from 'sentry/utils/tokenizeSearch';
import useApi from 'sentry/utils/useApi';
import {useBreakpoints} from 'sentry/utils/useBreakpoints';
import {useLocation} from 'sentry/utils/useLocation';
import {useNavigate} from 'sentry/utils/useNavigate';
import useOrganization from 'sentry/utils/useOrganization';
import usePageFilters from 'sentry/utils/usePageFilters';
import {MISSING_DATA_MESSAGE} from 'sentry/views/dashboards/widgets/common/settings';
import {TimeSeriesWidgetVisualization} from 'sentry/views/dashboards/widgets/timeSeriesWidget/timeSeriesWidgetVisualization';
import {Widget} from 'sentry/views/dashboards/widgets/widget/widget';
import * as ModuleLayout from 'sentry/views/insights/common/components/moduleLayout';
import {ToolRibbon} from 'sentry/views/insights/common/components/ribbon';
import {SpanDescriptionCell} from 'sentry/views/insights/common/components/tableCells/spanDescriptionCell';
import {TimeSpentCell} from 'sentry/views/insights/common/components/tableCells/timeSpentCell';
import {useOnboardingProject} from 'sentry/views/insights/common/queries/useOnboardingProject';
import {useSpanMetricsTopNSeries} from 'sentry/views/insights/common/queries/useSpanMetricsTopNSeries';
import {convertSeriesToTimeseries} from 'sentry/views/insights/common/utils/convertSeriesToTimeseries';
import {ViewTrendsButton} from 'sentry/views/insights/common/viewTrendsButton';
import {BackendHeader} from 'sentry/views/insights/pages/backend/backendPageHeader';
import {BACKEND_LANDING_TITLE} from 'sentry/views/insights/pages/backend/settings';
import {ModuleName} from 'sentry/views/insights/types';
import NoGroupsHandler from 'sentry/views/issueList/noGroupsHandler';
import {generateBackendPerformanceEventView} from 'sentry/views/performance/data';
import {LegacyOnboarding} from 'sentry/views/performance/onboarding';
import {transactionSummaryRouteWithQuery} from 'sentry/views/performance/transactionSummary/utils';
import {
  getTransactionSearchQuery,
  ProjectPerformanceType,
} from 'sentry/views/performance/utils';

import {InsightsBarChartWidget} from '../../common/components/insightsBarChartWidget';
import {InsightsLineChartWidget} from '../../common/components/insightsLineChartWidget';
import type {DiscoverSeries} from '../../common/queries/useDiscoverSeries';

function getFreeTextFromQuery(query: string) {
  const conditions = new MutableSearch(query);
  const transactionValues = conditions.getFilterValues('transaction');
  if (transactionValues.length) {
    return transactionValues[0];
  }
  if (conditions.freeText.length > 0) {
    // raw text query will be wrapped in wildcards in generatePerformanceEventView
    // so no need to wrap it here
    return conditions.freeText.join(' ');
  }
  return '';
}

export function LaravelOverviewPage() {
  const api = useApi();
  const organization = useOrganization();
  const location = useLocation();
  const onboardingProject = useOnboardingProject();
  const {selection} = usePageFilters();
  const navigate = useNavigate();

  const withStaticFilters = canUseMetricsData(organization);
  const eventView = generateBackendPerformanceEventView(location, withStaticFilters);

  const showOnboarding = onboardingProject !== undefined;

  function handleSearch(searchQuery: string) {
    navigate({
      pathname: location.pathname,
      query: {
        ...location.query,
        cursor: undefined,
        query: String(searchQuery).trim() || undefined,
        isDefaultQuery: false,
      },
    });
  }

  const derivedQuery = getTransactionSearchQuery(location, eventView.query);

  return (
    <Feature
      features="performance-view"
      organization={organization}
      renderDisabled={NoAccess}
    >
      <BackendHeader
        headerTitle={BACKEND_LANDING_TITLE}
        headerActions={<ViewTrendsButton />}
      />
      <Layout.Body>
        <Layout.Main fullWidth>
          <ModuleLayout.Layout>
            <ModuleLayout.Full>
              <ToolRibbon>
                <PageFilterBar condensed>
                  <ProjectPageFilter />
                  <EnvironmentPageFilter />
                  <DatePageFilter />
                </PageFilterBar>
                {!showOnboarding && (
                  <StyledTransactionNameSearchBar
                    organization={organization}
                    eventView={eventView}
                    onSearch={(query: string) => {
                      handleSearch(query);
                    }}
                    query={getFreeTextFromQuery(derivedQuery)!}
                  />
                )}
              </ToolRibbon>
            </ModuleLayout.Full>
            <ModuleLayout.Full>
              {!showOnboarding && (
                <PerformanceDisplayProvider
                  value={{performanceType: ProjectPerformanceType.BACKEND}}
                >
                  <WidgetGrid>
                    <RequestsContainer>
                      <RequestsWidget query={derivedQuery} />
                    </RequestsContainer>
                    <IssuesContainer>
                      <IssuesWidget
                        organization={organization}
                        location={location}
                        projectId={selection.projects[0]!}
                        query={derivedQuery}
                        api={api}
                      />
                    </IssuesContainer>
                    <DurationContainer>
                      <DurationWidget query={derivedQuery} />
                    </DurationContainer>
                    <JobsContainer>
                      <JobsWidget query={derivedQuery} />
                    </JobsContainer>
                    <QueriesContainer>
                      <QueriesWidget query={derivedQuery} />
                    </QueriesContainer>
                    <CachesContainer>
                      <CachesWidget query={derivedQuery} />
                    </CachesContainer>
                  </WidgetGrid>
                  <RoutesTable query={derivedQuery} />
                </PerformanceDisplayProvider>
              )}
              {showOnboarding && (
                <LegacyOnboarding
                  project={onboardingProject}
                  organization={organization}
                />
              )}
            </ModuleLayout.Full>
          </ModuleLayout.Layout>
        </Layout.Main>
      </Layout.Body>
    </Feature>
  );
}

const WidgetGrid = styled('div')`
  display: grid;
  gap: ${space(2)};
  padding-bottom: ${space(2)};

  grid-template-columns: minmax(0, 1fr);
  grid-template-rows: repeat(6, 300px);
  grid-template-areas:
    'requests'
    'issues'
    'duration'
    'jobs'
    'queries'
    'caches';

  @media (min-width: ${p => p.theme.breakpoints.xsmall}) {
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
    grid-template-rows: 300px 270px repeat(2, 300px);
    grid-template-areas:
      'requests duration'
      'issues issues'
      'jobs queries'
      'caches caches';
  }

  @media (min-width: ${p => p.theme.breakpoints.large}) {
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr) minmax(0, 1fr);
    grid-template-rows: 200px 200px repeat(1, 300px);
    grid-template-areas:
      'requests issues issues'
      'duration issues issues'
      'jobs queries caches';
  }
`;

const RequestsContainer = styled('div')`
  grid-area: requests;
  min-width: 0;
  & > * {
    height: 100% !important;
  }
`;

// TODO(aknaus): Remove css hacks and build custom IssuesWidget
const IssuesContainer = styled('div')`
  grid-area: issues;
  display: grid;
  grid-template-columns: 1fr;
  grid-template-rows: 1fr;
  & > * {
    min-width: 0;
    overflow-y: auto;
    margin-bottom: 0 !important;
  }

  & ${PanelHeader} {
    position: sticky;
    top: 0;
    z-index: ${p => p.theme.zIndex.header};
  }
`;

const DurationContainer = styled('div')`
  grid-area: duration;
  min-width: 0;
  & > * {
    height: 100% !important;
  }
`;

const JobsContainer = styled('div')`
  grid-area: jobs;
  min-width: 0;
  & > * {
    height: 100% !important;
  }
`;

// TODO(aknaus): Remove css hacks and build custom QueryWidget
const QueriesContainer = styled('div')`
  grid-area: queries;
  display: grid;
  grid-template-columns: 1fr;
  grid-template-rows: 1fr;

  & > * {
    min-width: 0;
  }
`;

// TODO(aknaus): Remove css hacks and build custom CacheWidget
const CachesContainer = styled('div')`
  grid-area: caches;
  display: grid;
  grid-template-columns: 1fr;
  grid-template-rows: 1fr;

  & > * {
    min-width: 0;
  }
`;

const StyledTransactionNameSearchBar = styled(TransactionNameSearchBar)`
  flex: 2;
`;

type IssuesWidgetProps = {
  api: Client;
  location: Location;
  organization: Organization;
  projectId: number;
  query: string;
};

function IssuesWidget({
  organization,
  location,
  projectId,
  query,
  api,
}: IssuesWidgetProps) {
  const queryParams = {
    limit: '5',
    ...normalizeDateTimeParams(
      pick(location.query, [...Object.values(URL_PARAM), 'cursor'])
    ),
    query,
    sort: 'freq',
  };

  const breakpoints = useBreakpoints();

  function renderEmptyMessage() {
    const selectedTimePeriod = location.query.start
      ? null
      : // @ts-expect-error TS(7053): Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
        DEFAULT_RELATIVE_PERIODS[
          decodeScalar(location.query.statsPeriod, DEFAULT_STATS_PERIOD)
        ];
    const displayedPeriod = selectedTimePeriod
      ? selectedTimePeriod.toLowerCase()
      : t('given timeframe');

    return (
      <Panel style={{display: 'flex', justifyContent: 'center', alignItems: 'center'}}>
        <PanelBody>
          <NoGroupsHandler
            api={api}
            organization={organization}
            query={query}
            selectedProjectIds={[projectId]}
            groupIds={[]}
            emptyMessage={tct('No [issuesType] issues for the [timePeriod].', {
              issuesType: '',
              timePeriod: displayedPeriod,
            })}
          />
        </PanelBody>
      </Panel>
    );
  }

  // TODO(aknaus): Remove GroupList and use StreamGroup directly
  return (
    <GroupList
      orgSlug={organization.slug}
      queryParams={queryParams}
      canSelectGroups={false}
      renderEmptyMessage={renderEmptyMessage}
      withChart={breakpoints.xlarge}
      withPagination={false}
    />
  );
}

function usePageFilterChartParams({
  granularity = 'spans',
}: {
  granularity?: Fidelity;
} = {}) {
  const {selection} = usePageFilters();

  const normalizedDateTime = useMemo(
    () => normalizeDateTimeParams(selection.datetime),
    [selection.datetime]
  );

  return {
    ...normalizedDateTime,
    interval: getInterval(selection.datetime, granularity),
    project: selection.projects,
  };
}

function RequestsWidget({query}: {query?: string}) {
  const organization = useOrganization();
  const pageFilterChartParams = usePageFilterChartParams({granularity: 'spans-low'});
  const theme = useTheme();

  const {data, isLoading, error} = useApiQuery<MultiSeriesEventsStats>(
    [
      `/organizations/${organization.slug}/events-stats/`,
      {
        query: {
          ...pageFilterChartParams,
          dataset: 'spans',
          field: ['trace.status', 'count(span.duration)'],
          yAxis: 'count(span.duration)',
          orderby: '-count(span.duration)',
          partial: 1,
          query: `span.op:http.server ${query}`.trim(),
          useRpc: 1,
          topEvents: 10,
        },
      },
    ],
    {staleTime: 0}
  );

  const combineTimeSeries = useCallback(
    (
      seriesData: EventsStats[],
      color: string,
      fieldName: string
    ): DiscoverSeries | undefined => {
      const firstSeries = seriesData[0];
      if (!firstSeries) {
        return undefined;
      }

      return {
        data: firstSeries.data.map(([time], index) => ({
          name: new Date(time * 1000).toISOString(),
          value: seriesData.reduce(
            (acc, series) => acc + series.data[index]?.[1][0]?.count!,
            0
          ),
        })),
        seriesName: fieldName,
        meta: {
          fields: {
            [fieldName]: 'integer',
          },
          units: {},
        },
        color,
      } satisfies DiscoverSeries;
    },
    []
  );

  const timeSeries = useMemo(() => {
    return [
      combineTimeSeries(
        [data?.ok].filter(series => !!series),
        theme.gray200,
        '2xx'
      ),
      combineTimeSeries(
        [data?.invalid_argument, data?.internal_error].filter(series => !!series),
        theme.error,
        '5xx'
      ),
    ].filter(series => !!series);
  }, [
    combineTimeSeries,
    data?.internal_error,
    data?.invalid_argument,
    data?.ok,
    theme.error,
    theme.gray200,
  ]);

  return (
    <InsightsBarChartWidget
      title="Requests"
      isLoading={isLoading}
      error={error}
      series={timeSeries}
      stacked
    />
  );
}

function DurationWidget({query}: {query?: string}) {
  const organization = useOrganization();
  const pageFilterChartParams = usePageFilterChartParams();

  const {data, isLoading, error} = useApiQuery<MultiSeriesEventsStats>(
    [
      `/organizations/${organization.slug}/events-stats/`,
      {
        query: {
          ...pageFilterChartParams,
          dataset: 'spans',
          yAxis: ['avg(span.duration)', 'p95(span.duration)'],
          orderby: 'avg(span.duration)',
          partial: 1,
          useRpc: 1,
          query: `span.op:http.server ${query}`.trim(),
        },
      },
    ],
    {staleTime: 0}
  );

  const getTimeSeries = useCallback(
    (field: string, color?: string): DiscoverSeries | undefined => {
      const series = data?.[field];
      if (!series) {
        return undefined;
      }

      return {
        data: series.data.map(([time, [value]]) => ({
          value: value?.count!,
          name: new Date(time * 1000).toISOString(),
        })),
        seriesName: field,
        meta: series.meta as EventsMetaType,
        color,
      } satisfies DiscoverSeries;
    },
    [data]
  );

  const timeSeries = useMemo(() => {
    return [
      getTimeSeries('avg(span.duration)', CHART_PALETTE[1][0]),
      getTimeSeries('p95(span.duration)', CHART_PALETTE[1][1]),
    ].filter(series => !!series);
  }, [getTimeSeries]);

  return (
    <InsightsLineChartWidget
      title="Duration"
      isLoading={isLoading}
      error={error}
      series={timeSeries}
    />
  );
}

function JobsWidget({query}: {query?: string}) {
  const organization = useOrganization();
  const pageFilterChartParams = usePageFilterChartParams({
    granularity: 'low',
  });
  const theme = useTheme();

  const {data, isLoading, error} = useApiQuery<MultiSeriesEventsStats>(
    [
      `/organizations/${organization.slug}/events-stats/`,
      {
        query: {
          ...pageFilterChartParams,
          dataset: 'spansMetrics',
          excludeOther: 0,
          per_page: 50,
          partial: 1,
          transformAliasToInputFormat: 1,
          query: `span.op:queue.process ${query}`.trim(),
          yAxis: ['trace_status_rate(ok)', 'spm()'],
        },
      },
    ],
    {staleTime: 0}
  );

  const intervalInMinutes = parsePeriodToHours(pageFilterChartParams.interval) * 60;

  const timeSeries = useMemo<DiscoverSeries[]>(() => {
    if (!data) {
      return [];
    }

    const okJobsRate = data['trace_status_rate(ok)'];
    const spansPerMinute = data['spm()'];

    if (!okJobsRate || !spansPerMinute) {
      return [];
    }

    const getSpansInTimeBucket = (index: number) => {
      const spansPerMinuteValue = spansPerMinute.data[index]?.[1][0]?.count! || 0;
      return spansPerMinuteValue * intervalInMinutes;
    };

    const [okJobs, failedJobs] = okJobsRate.data.reduce<[DiscoverSeries, DiscoverSeries]>(
      (acc, [time, [value]], index) => {
        const spansInTimeBucket = getSpansInTimeBucket(index);
        const okJobsRateValue = value?.count! || 0;
        const failedJobsRateValue = value?.count ? 1 - value.count : 1;

        acc[0].data.push({
          value: okJobsRateValue * spansInTimeBucket,
          name: new Date(time * 1000).toISOString(),
        });

        acc[1].data.push({
          value: failedJobsRateValue * spansInTimeBucket,
          name: new Date(time * 1000).toISOString(),
        });

        return acc;
      },
      [
        {
          data: [],
          color: theme.gray200,
          seriesName: 'Processed',
          meta: {
            fields: {
              Processed: 'integer',
            },
            units: {},
          },
        },
        {
          data: [],
          color: theme.error,
          seriesName: 'Failed',
          meta: {
            fields: {
              Failed: 'integer',
            },
            units: {},
          },
        },
      ]
    );

    return [okJobs, failedJobs];
  }, [data, intervalInMinutes, theme.error, theme.gray200]);

  return (
    <InsightsBarChartWidget
      title="Jobs"
      stacked
      isLoading={isLoading}
      error={error}
      series={timeSeries}
    />
  );
}

interface QueriesDiscoverQueryResponse {
  data: Array<{
    'avg(span.self_time)': number;
    'project.id': string;
    'span.description': string;
    'span.group': string;
    'span.op': string;
    'sum(span.self_time)': number;
    'time_spent_percentage()': number;
    transaction: string;
  }>;
}

function QueriesWidget({query}: {query?: string}) {
  const organization = useOrganization();
  const pageFilterChartParams = usePageFilterChartParams();

  const queriesRequest = useApiQuery<QueriesDiscoverQueryResponse>(
    [
      `/organizations/${organization.slug}/events/`,
      {
        query: {
          ...pageFilterChartParams,
          dataset: 'spansMetrics',
          field: [
            'span.op',
            'span.group',
            'project.id',
            'span.description',
            'sum(span.self_time)',
            'avg(span.self_time)',
            'time_spent_percentage()',
            'transaction',
          ],
          query: `has:span.description span.module:db ${query}`,
          sort: '-time_spent_percentage()',
          per_page: 3,
        },
      },
    ],
    {staleTime: 0}
  );

  const timeSeriesRequest = useSpanMetricsTopNSeries({
    search: new MutableSearch(
      // Cannot use transaction:[value1, value2] syntax as
      // MutableSearch might escape it to transactions:"[value1, value2]" for some values
      queriesRequest.data?.data
        .map(item => `span.group:"${item['span.group']}"`)
        .join(' OR ') || ''
    ),
    fields: ['span.group', 'sum(span.self_time)'],
    yAxis: ['sum(span.self_time)'],
    sorts: [
      {
        field: 'sum(span.self_time)',
        kind: 'desc',
      },
    ],
    topEvents: 3,
    enabled: !!queriesRequest.data?.data,
  });

  const timeSeries = useMemo<DiscoverSeries[]>(() => {
    if (!timeSeriesRequest.data && timeSeriesRequest.meta) {
      return [];
    }

    return Object.keys(timeSeriesRequest.data).map(key => {
      const seriesData = timeSeriesRequest.data[key]!;
      return {
        ...seriesData,
        // TODO(aknaus): useSpanMetricsTopNSeries does not return the meta for the series
        meta: {
          fields: {
            [seriesData.seriesName]: 'duration',
          },
          units: {
            [seriesData.seriesName]: 'millisecond',
          },
        },
      };
    });
  }, [timeSeriesRequest.data, timeSeriesRequest.meta]);

  const isLoading = timeSeriesRequest.isLoading || queriesRequest.isLoading;
  const error = timeSeriesRequest.error || queriesRequest.error;

  const hasData =
    queriesRequest.data && queriesRequest.data.data.length > 0 && timeSeries.length > 0;

  return (
    <Widget
      Title={<Widget.WidgetTitle title="Slow Queries" />}
      Visualization={
        isLoading ? (
          <TimeSeriesWidgetVisualization.LoadingPlaceholder />
        ) : error ? (
          <Widget.WidgetError error={error} />
        ) : !hasData ? (
          <Widget.WidgetError error={MISSING_DATA_MESSAGE} />
        ) : (
          <TimeSeriesWidgetVisualization
            visualizationType="line"
            aliases={Object.fromEntries(
              queriesRequest.data?.data.map(item => [
                item['span.group'],
                item['span.description'],
              ]) ?? []
            )}
            timeSeries={timeSeries.map(convertSeriesToTimeseries)}
          />
        )
      }
      Footer={
        hasData && (
          <WidgetFooterTable>
            {queriesRequest.data?.data.map(item => (
              <Fragment key={item['span.description']}>
                <OverflowCell>
                  <SpanDescriptionCell
                    projectId={Number(item['project.id'])}
                    group={item['span.group']}
                    description={item['span.description']}
                    moduleName={ModuleName.DB}
                  />
                  <ControllerText>{item.transaction}</ControllerText>
                </OverflowCell>
                <TimeSpentCell
                  percentage={item['time_spent_percentage()']}
                  total={item['sum(span.self_time)']}
                  op={item['span.op']}
                />
              </Fragment>
            ))}
          </WidgetFooterTable>
        )
      }
    />
  );
}

function CachesWidget({query}: {query?: string}) {
  const organization = useOrganization();
  const pageFilterChartParams = usePageFilterChartParams();

  const cachesRequest = useApiQuery<{
    data: Array<{
      'cache_miss_rate()': number;
      'project.id': string;
      transaction: string;
    }>;
  }>(
    [
      `/organizations/${organization.slug}/events/`,
      {
        query: {
          ...pageFilterChartParams,
          dataset: 'spansMetrics',
          field: ['transaction', 'project.id', 'cache_miss_rate()'],
          query: `span.op:[cache.get_item,cache.get] ${query}`,
          sort: '-cache_miss_rate()',
          per_page: 4,
        },
      },
    ],
    {staleTime: 0}
  );

  const timeSeriesRequest = useSpanMetricsTopNSeries({
    search: new MutableSearch(
      // Cannot use transaction:[value1, value2] syntax as
      // MutableSearch might escape it to transactions:"[value1, value2]" for some values
      cachesRequest.data?.data
        .map(item => `transaction:"${item.transaction}"`)
        .join(' OR ') || ''
    ),
    fields: ['transaction', 'cache_miss_rate()'],
    yAxis: ['cache_miss_rate()'],
    sorts: [
      {
        field: 'cache_miss_rate()',
        kind: 'desc',
      },
    ],
    topEvents: 4,
    enabled: !!cachesRequest.data?.data,
  });

  const timeSeries = useMemo<DiscoverSeries[]>(() => {
    if (!timeSeriesRequest.data && timeSeriesRequest.meta) {
      return [];
    }

    return Object.keys(timeSeriesRequest.data).map(key => {
      const seriesData = timeSeriesRequest.data[key]!;
      return {
        ...seriesData,
        // TODO(aknaus): useSpanMetricsTopNSeries does not return the meta for the series
        meta: {
          fields: {
            [seriesData.seriesName]: 'percentage',
          },
          units: {
            [seriesData.seriesName]: '%',
          },
        },
      };
    });
  }, [timeSeriesRequest.data, timeSeriesRequest.meta]);

  const isLoading = timeSeriesRequest.isLoading || cachesRequest.isLoading;
  const error = timeSeriesRequest.error || cachesRequest.error;

  const hasData =
    cachesRequest.data && cachesRequest.data.data.length > 0 && timeSeries.length > 0;

  return (
    <Widget
      Title={<Widget.WidgetTitle title="Caches" />}
      Visualization={
        isLoading ? (
          <TimeSeriesWidgetVisualization.LoadingPlaceholder />
        ) : error ? (
          <Widget.WidgetError error={error} />
        ) : !hasData ? (
          <Widget.WidgetError error={MISSING_DATA_MESSAGE} />
        ) : (
          <TimeSeriesWidgetVisualization
            visualizationType="line"
            timeSeries={timeSeries.map(convertSeriesToTimeseries)}
          />
        )
      }
      Footer={
        hasData && (
          <WidgetFooterTable>
            {cachesRequest.data?.data.map(item => (
              <Fragment key={item.transaction}>
                <OverflowCell>
                  <Link
                    to={`/insights/backend/caches?project=${item['project.id']}&transaction=${item.transaction}`}
                  >
                    {item.transaction}
                  </Link>
                </OverflowCell>
                <span>{(item['cache_miss_rate()'] * 100).toFixed(2)}%</span>
              </Fragment>
            ))}
          </WidgetFooterTable>
        )
      }
    />
  );
}

const OverflowCell = styled('div')`
  ${p => p.theme.overflowEllipsis};
  min-width: 0px;
`;

const WidgetFooterTable = styled('div')`
  display: grid;
  grid-template-columns: 1fr max-content;
  margin: -${space(1)} -${space(2)};
  font-size: ${p => p.theme.fontSizeSmall};

  & > * {
    padding: ${space(1)} ${space(1)};
  }

  & > *:nth-child(2n + 1) {
    padding-left: ${space(2)};
  }

  & > *:nth-child(2n) {
    padding-right: ${space(2)};
  }

  & > *:not(:nth-last-child(-n + 2)) {
    border-bottom: 1px solid ${p => p.theme.border};
  }
`;

interface DiscoverQueryResponse {
  data: Array<{
    'avg(transaction.duration)': number;
    'count()': number;
    'count_unique(user)': number;
    'failure_rate()': number;
    'http.method': string;
    'p95()': number;
    'project.id': string;
    transaction: string;
  }>;
}

interface RouteControllerMapping {
  'count(span.duration)': number;
  'span.description': string;
  transaction: string;
  'transaction.method': string;
}

const errorRateColorThreshold = {
  danger: 0.1,
  warning: 0.05,
} as const;

const getP95Threshold = (avg: number) => {
  return {
    danger: avg * 3,
    warning: avg * 2,
  };
};

const getCellColor = (value: number, thresholds: Record<string, number>) => {
  return Object.entries(thresholds).find(([_, threshold]) => value >= threshold)?.[0];
};

const StyledPanelTable = styled(PanelTable)`
  grid-template-columns: max-content minmax(200px, 1fr) repeat(5, max-content);
`;

const Cell = styled('div')`
  display: flex;
  align-items: center;
  gap: ${space(0.5)};
  overflow: hidden;
  white-space: nowrap;
  padding: ${space(1)} ${space(2)};

  &[data-color='danger'] {
    color: ${p => p.theme.red400};
  }
  &[data-color='warning'] {
    color: ${p => p.theme.yellow400};
  }
  &[data-align='right'] {
    text-align: right;
    justify-content: flex-end;
  }
`;

const HeaderCell = styled(Cell)`
  padding: 0;
`;

const PathCell = styled(Cell)`
  flex-direction: column;
  justify-content: center;
  align-items: flex-start;
  gap: ${space(0.5)};
  min-width: 0px;
`;

const ControllerText = styled('div')`
  ${p => p.theme.overflowEllipsis};
  color: ${p => p.theme.gray300};
  font-size: ${p => p.theme.fontSizeSmall};
  line-height: 1;
  min-width: 0px;
`;

function RoutesTable({query}: {query?: string}) {
  const organization = useOrganization();
  const pageFilterChartParams = usePageFilterChartParams();
  const theme = useTheme();

  const transactionsRequest = useApiQuery<DiscoverQueryResponse>(
    [
      `/organizations/${organization.slug}/events/`,
      {
        query: {
          ...pageFilterChartParams,
          dataset: 'metrics',
          field: [
            'http.method',
            'project.id',
            'transaction',
            'avg(transaction.duration)',
            'p95()',
            'failure_rate()',
            'count()',
            'count_unique(user)',
          ],
          query: `(transaction.op:http.server) event.type:transaction ${query}`,
          referrer: 'api.performance.landing-table',
          orderby: '-count()',
          per_page: 10,
        },
      },
    ],
    {staleTime: 0}
  );

  // Get the list of transactions from the first request
  const transactionPaths = useMemo(() => {
    return (
      transactionsRequest.data?.data.map(transactions => transactions.transaction) ?? []
    );
  }, [transactionsRequest.data]);

  const routeControllersRequest = useApiQuery<{data: RouteControllerMapping[]}>(
    [
      `/organizations/${organization.slug}/events/`,
      {
        query: {
          ...pageFilterChartParams,
          dataset: 'spans',
          field: [
            'span.description',
            'transaction',
            'transaction.method',
            'count(span.duration)',
          ],
          // Add transaction filter to route controller request
          query: `transaction.op:http.server span.op:http.route transaction:[${
            transactionPaths.map(transactions => `"${transactions}"`).join(',') || '""'
          }]`,
          sort: '-transaction',
          per_page: 25,
        },
      },
    ],
    {
      staleTime: 0,
      // Only fetch after we have the transactions data and there are transactions to look up
      enabled: !!transactionsRequest.data?.data && transactionPaths.length > 0,
    }
  );

  const tableData = useMemo(() => {
    if (!transactionsRequest.data?.data) {
      return [];
    }

    // Create a mapping of transaction path to controller
    const controllerMap = new Map(
      routeControllersRequest.data?.data.map(item => [
        item.transaction,
        item['span.description'],
      ])
    );

    return transactionsRequest.data.data.map(transaction => ({
      method: transaction['http.method'],
      transaction: transaction.transaction,
      requests: transaction['count()'],
      avg: transaction['avg(transaction.duration)'],
      p95: transaction['p95()'],
      errorRate: transaction['failure_rate()'],
      users: transaction['count_unique(user)'],
      controller: controllerMap.get(transaction.transaction),
      projectId: transaction['project.id'],
    }));
  }, [transactionsRequest.data, routeControllersRequest.data]);

  return (
    <StyledPanelTable
      headers={[
        'Method',
        'Path',
        <HeaderCell key="requests">
          <IconArrow direction="down" />
          Requests
        </HeaderCell>,
        'Error Rate',
        'AVG',
        'P95',
        <HeaderCell key="users" data-align="right">
          Users
        </HeaderCell>,
      ]}
      isLoading={transactionsRequest.isLoading}
      isEmpty={!tableData || tableData.length === 0}
    >
      {tableData?.map(transaction => {
        const p95Color = getCellColor(transaction.p95, getP95Threshold(transaction.avg));
        const errorRateColor = getCellColor(
          transaction.errorRate,
          errorRateColorThreshold
        );

        return (
          <Fragment key={transaction.method + transaction.transaction}>
            <Cell>{transaction.method}</Cell>
            <PathCell>
              <Tooltip
                title={transaction.transaction}
                position="top"
                maxWidth={400}
                showOnlyOnOverflow
                skipWrapper
              >
                <Link
                  css={css`
                    ${theme.overflowEllipsis};
                    min-width: 0px;
                  `}
                  to={transactionSummaryRouteWithQuery({
                    organization,
                    transaction: transaction.transaction,
                    view: 'backend',
                    projectID: transaction.projectId,
                    query: {},
                  })}
                >
                  {transaction.transaction}
                </Link>
              </Tooltip>
              {routeControllersRequest.isLoading ? (
                <Placeholder height={theme.fontSizeSmall} width="200px" />
              ) : (
                transaction.controller && (
                  <Tooltip
                    title={transaction.controller}
                    position="top"
                    maxWidth={400}
                    showOnlyOnOverflow
                    skipWrapper
                  >
                    <ControllerText>{transaction.controller}</ControllerText>
                  </Tooltip>
                )
              )}
            </PathCell>
            <Cell>{formatAbbreviatedNumber(transaction.requests)}</Cell>
            <Cell data-color={errorRateColor}>
              {(transaction.errorRate * 100).toFixed(2)}%
            </Cell>
            <Cell>{getDuration(transaction.avg / 1000, 2, true, true)}</Cell>
            <Cell data-color={p95Color}>
              {getDuration(transaction.p95 / 1000, 2, true, true)}
            </Cell>
            <Cell data-align="right">
              {formatAbbreviatedNumber(transaction.users)}
              <IconUser size="xs" />
            </Cell>
          </Fragment>
        );
      })}
    </StyledPanelTable>
  );
}
