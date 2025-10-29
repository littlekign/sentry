import {Fragment, memo, useCallback} from 'react';
import styled from '@emotion/styled';

import Pagination from 'sentry/components/pagination';
import GridEditable, {
  COL_WIDTH_UNDEFINED,
  type GridColumnHeader,
  type GridColumnOrder,
} from 'sentry/components/tables/gridEditable';
import useStateBasedColumnResize from 'sentry/components/tables/gridEditable/useStateBasedColumnResize';
import TimeSince from 'sentry/components/timeSince';
import {IconArrow} from 'sentry/icons';
import {t} from 'sentry/locale';
import {useApiQuery} from 'sentry/utils/queryClient';
import useOrganization from 'sentry/utils/useOrganization';
import usePageFilters from 'sentry/utils/usePageFilters';
import {getExploreUrl} from 'sentry/views/explore/utils';
import {LLMCosts} from 'sentry/views/insights/agents/components/llmCosts';
import {useTableCursor} from 'sentry/views/insights/agents/hooks/useTableCursor';
import {ErrorCell} from 'sentry/views/insights/agents/utils/cells';
import {hasGenAiConversationsFeature} from 'sentry/views/insights/agents/utils/features';
import {Referrer} from 'sentry/views/insights/agents/utils/referrers';
import {TextAlignRight} from 'sentry/views/insights/common/components/textAlign';
import {DurationCell} from 'sentry/views/insights/pages/platform/shared/table/DurationCell';
import {NumberCell} from 'sentry/views/insights/pages/platform/shared/table/NumberCell';

interface TableData {
  conversationId: string;
  duration: number;
  errors: number;
  flow: string[];
  llmCalls: number;
  timestamp: number;
  toolCalls: number;
  totalCost: number | null;
  totalTokens: number;
  traceCount: number;
  traceIds: string[];
}

export function ConversationsTable() {
  const organization = useOrganization();
  const showTable = hasGenAiConversationsFeature(organization);

  if (!showTable) {
    return null;
  }
  return <ConversationsTableInner />;
}

const EMPTY_ARRAY: never[] = [];

const defaultColumnOrder: Array<GridColumnOrder<string>> = [
  {key: 'conversationId', name: t('Conversation ID'), width: 150},
  {key: 'flow', name: t('Flow'), width: COL_WIDTH_UNDEFINED}, // Containing summary of the conversation or list of agents
  {key: 'duration', name: t('Root Duration'), width: 130},
  {key: 'errors', name: t('Errors'), width: 100},
  {key: 'llmCalls', name: t('LLM Calls'), width: 110},
  {key: 'toolCalls', name: t('Tool Calls'), width: 110},
  {key: 'totalTokens', name: t('Total Tokens'), width: 120},
  {key: 'totalCost', name: t('Total Cost'), width: 120},
  {key: 'timestamp', name: t('Timestamp'), width: 100},
];

const rightAlignColumns = new Set([
  'errors',
  'llmCalls',
  'toolCalls',
  'totalTokens',
  'totalCost',
]);

function ConversationsTableInner() {
  const organization = useOrganization();
  const {columns: columnOrder, handleResizeColumn} = useStateBasedColumnResize({
    columns: defaultColumnOrder,
  });

  const {cursor, setCursor} = useTableCursor();

  const {
    data = [],
    isLoading,
    error,
    getResponseHeader,
  } = useApiQuery<TableData[]>(
    [`/organizations/${organization.slug}/ai-conversations/`, {query: {cursor}}],
    {
      staleTime: 0,
    }
  );

  const pageLinks = getResponseHeader?.('Link');

  const renderHeadCell = useCallback((column: GridColumnHeader<string>) => {
    return (
      <HeadCell align={rightAlignColumns.has(column.key) ? 'right' : 'left'}>
        {column.name}
        {column.key === 'timestamp' && <IconArrow direction="down" size="xs" />}
        {column.key === 'flow' && <CellExpander />}
      </HeadCell>
    );
  }, []);

  const renderBodyCell = useCallback(
    (column: GridColumnOrder<string>, dataRow: TableData) => {
      return <BodyCell column={column} dataRow={dataRow} query="" />;
    },
    []
  );

  return (
    <Fragment>
      <GridEditableContainer>
        <GridEditable
          isLoading={isLoading}
          error={error}
          data={data}
          columnOrder={columnOrder}
          columnSortBy={EMPTY_ARRAY}
          stickyHeader
          grid={{
            renderBodyCell,
            renderHeadCell,
            onResizeColumn: handleResizeColumn,
          }}
        />
      </GridEditableContainer>
      <Pagination pageLinks={pageLinks} onCursor={setCursor} />
    </Fragment>
  );
}

const BodyCell = memo(function BodyCell({
  column,
  dataRow,
}: {
  column: GridColumnHeader<string>;
  dataRow: TableData;
  query: string;
}) {
  const organization = useOrganization();
  const {selection} = usePageFilters();

  switch (column.key) {
    case 'conversationId':
      return <span>{dataRow.conversationId}</span>;
    case 'flow':
      return <span>{dataRow.flow.join(' → ')}</span>;
    case 'duration':
      return <DurationCell milliseconds={dataRow.duration} />;
    case 'errors':
      return (
        <ErrorCell
          value={dataRow.errors}
          target={getExploreUrl({
            query: `span.status:internal_error trace:[${dataRow.traceIds.join(',')}]`,
            organization,
            selection,
            referrer: Referrer.TRACES_TABLE,
          })}
          isLoading={false}
        />
      );
    case 'llmCalls':
    case 'toolCalls':
    case 'totalTokens':
      return <NumberCell value={dataRow[column.key]} />;
    case 'totalCost':
      return (
        <TextAlignRight>
          <LLMCosts cost={dataRow.totalCost} />
        </TextAlignRight>
      );
    case 'timestamp':
      return (
        <TextAlignRight>
          <TimeSince unitStyle="extraShort" date={new Date(dataRow.timestamp)} />
        </TextAlignRight>
      );
    default:
      return null;
  }
});

const GridEditableContainer = styled('div')`
  position: relative;
  margin-bottom: ${p => p.theme.space.md};
`;

/**
 * Used to force the cell to expand take as much width as possible in the table layout
 * otherwise grid editable will let the last column grow
 */
const CellExpander = styled('div')`
  width: 100vw;
`;

const HeadCell = styled('div')<{align: 'left' | 'right'}>`
  display: flex;
  flex: 1;
  align-items: center;
  gap: ${p => p.theme.space.xs};
  justify-content: ${p => (p.align === 'right' ? 'flex-end' : 'flex-start')};
`;
