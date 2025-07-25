import {useTheme} from '@emotion/react';
import styled from '@emotion/styled';

import {ExternalLink} from 'sentry/components/core/link';
import EmptyStateWarning from 'sentry/components/emptyStateWarning';
import LoadingIndicator from 'sentry/components/loadingIndicator';
import QuestionTooltip from 'sentry/components/questionTooltip';
import {DEFAULT_RELATIVE_PERIODS} from 'sentry/constants';
import {t} from 'sentry/locale';
import {space} from 'sentry/styles/space';
import usePageFilters from 'sentry/utils/usePageFilters';
import PerformanceScoreRingWithTooltips from 'sentry/views/insights/browser/webVitals/components/performanceScoreRingWithTooltips';
import {MODULE_DOC_LINK} from 'sentry/views/insights/browser/webVitals/settings';
import type {
  ProjectScore,
  WebVitals,
} from 'sentry/views/insights/browser/webVitals/types';
import PerformanceScoreBreakdownChartWidget from 'sentry/views/insights/common/components/widgets/performanceScoreBreakdownChartWidget';

type Props = {
  isProjectScoreLoading?: boolean;
  projectScore?: ProjectScore;
  webVital?: WebVitals | null;
};

export const ORDER: WebVitals[] = ['lcp', 'fcp', 'inp', 'cls', 'ttfb'];

export function PerformanceScoreChart({
  projectScore,
  webVital,
  isProjectScoreLoading,
}: Props) {
  const theme = useTheme();
  const pageFilters = usePageFilters();

  const score = projectScore
    ? webVital
      ? projectScore[`${webVital}Score`]
      : projectScore.totalScore
    : undefined;

  let ringSegmentColors = theme.chart.getColorPalette(4).slice() as unknown as string[];
  let ringBackgroundColors = ringSegmentColors.map(color => `${color}50`);

  if (webVital) {
    const index = ORDER.indexOf(webVital);
    ringSegmentColors = ringSegmentColors.map((color, i) => {
      return i === index ? color : theme.gray200;
    });
    ringBackgroundColors = ringBackgroundColors.map((color, i) => {
      return i === index ? color : `${theme.gray200}33`;
    });
  }

  const period = pageFilters.selection.datetime.period;
  // @ts-expect-error TS(7053): Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
  const performanceScoreSubtext = (period && DEFAULT_RELATIVE_PERIODS[period]) ?? '';

  return (
    <Flex>
      <PerformanceScoreLabelContainer>
        <PerformanceScoreLabel>
          {t('Performance Score')}
          <StyledQuestionTooltip
            isHoverable
            size="sm"
            title={
              <span>
                {t('The overall performance rating of this page.')}
                <br />
                <ExternalLink href={`${MODULE_DOC_LINK}#performance-score`}>
                  {t('How is this calculated?')}
                </ExternalLink>
              </span>
            }
          />
        </PerformanceScoreLabel>
        <PerformanceScoreSubtext>{performanceScoreSubtext}</PerformanceScoreSubtext>
        {isProjectScoreLoading && <StyledLoadingIndicator size={50} />}
        {!isProjectScoreLoading && projectScore && (
          <PerformanceScoreRingWithTooltips
            projectScore={projectScore}
            text={score}
            width={220}
            height={200}
            ringBackgroundColors={ringBackgroundColors}
            ringSegmentColors={ringSegmentColors}
          />
        )}
        {!isProjectScoreLoading && !projectScore && (
          <EmptyStateWarning>
            <p>{t('No Web Vitals found')}</p>
          </EmptyStateWarning>
        )}
      </PerformanceScoreLabelContainer>
      <ChartContainer>
        <PerformanceScoreBreakdownChartWidget />
      </ChartContainer>
    </Flex>
  );
}

const ChartContainer = styled('div')`
  flex: 1 1 0%;
`;

const Flex = styled('div')`
  display: flex;
  flex-direction: row;
  justify-content: space-between;
  width: 100%;
  gap: ${space(1)};
  margin-top: ${space(1)};
  flex-wrap: wrap;
`;

const PerformanceScoreLabelContainer = styled('div')`
  padding: ${space(2)} ${space(2)} 0 ${space(2)};
  min-width: 320px;
  border: 1px solid ${p => p.theme.border};
  border-radius: ${p => p.theme.borderRadius};
  display: flex;
  align-items: center;
  flex-direction: column;
  @media (max-width: ${p => p.theme.breakpoints.sm}) {
    flex-grow: 1;
  }
`;

const PerformanceScoreLabel = styled('div')`
  width: 100%;
  font-size: ${p => p.theme.fontSize.lg};
  color: ${p => p.theme.textColor};
  font-weight: ${p => p.theme.fontWeight.bold};
`;

const PerformanceScoreSubtext = styled('div')`
  width: 100%;
  font-size: ${p => p.theme.fontSize.sm};
  color: ${p => p.theme.subText};
  margin-bottom: ${space(1)};
`;

const StyledQuestionTooltip = styled(QuestionTooltip)`
  position: relative;
  margin-left: ${space(0.5)};
  top: ${space(0.25)};
`;

const StyledLoadingIndicator = styled(LoadingIndicator)`
  margin: 50px;
`;
