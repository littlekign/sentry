import type {AccuracyStats, Confidence} from 'sentry/types/organization';
import type {DataUnit} from 'sentry/utils/discover/fields';

import type {ThresholdsConfig} from '../../widgetBuilder/buildSteps/thresholdsStep/thresholdsStep';

export type Meta = {
  type: string | null; // TODO: This can probably be `AggregationOutputType`
  unit: DataUnit | null;
  isOther?: boolean;
};

type TableRow = Record<string, number | string | undefined>;
export type TableData = TableRow[];

export type TimeSeriesItem = {
  timestamp: string;
  value: number | null;
  delayed?: boolean;
};

export type TimeSeries = {
  data: TimeSeriesItem[];
  field: string;
  meta: Meta;
  confidence?: Confidence;
  sampleCount?: AccuracyStats<number>;
  samplingRate?: AccuracyStats<number | null>;
};

export type ErrorProp = Error | string;

export interface StateProps {
  error?: ErrorProp;
  isLoading?: boolean;
  onRetry?: () => void;
}

export type Thresholds = ThresholdsConfig;

export type Release = {
  timestamp: string;
  version: string;
};

export type LegendSelection = {[key: string]: boolean};
