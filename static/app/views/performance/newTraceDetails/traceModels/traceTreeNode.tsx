import type {Theme} from '@emotion/react';

import type {EventTransaction} from 'sentry/types/event';

import type {TraceTree} from './traceTree';

function isTraceTransaction(value: TraceTree.NodeValue): value is TraceTree.Transaction {
  return !!(value && 'transaction' in value);
}

function isTraceError(value: TraceTree.NodeValue): value is TraceTree.TraceError {
  return !!(value && 'level' in value);
}

function isTraceSpan(value: TraceTree.NodeValue): value is TraceTree.Span {
  return !!(
    value &&
    'span_id' in value &&
    !isTraceAutogroup(value) &&
    !isTraceTransaction(value)
  );
}

function isEAPSpan(value: TraceTree.NodeValue): value is TraceTree.EAPSpan {
  return !!(value && 'is_transaction' in value);
}

function isTraceAutogroup(
  value: TraceTree.NodeValue
): value is TraceTree.ChildrenAutogroup | TraceTree.SiblingAutogroup {
  return !!(value && 'autogrouped_by' in value);
}

function shouldCollapseNodeByDefault(node: TraceTreeNode<TraceTree.NodeValue>) {
  // Only collapse EAP spans if they are a segments/transactions
  if (isEAPSpan(node.value)) {
    return node.value.is_transaction;
  }

  if (isTraceSpan(node.value)) {
    // Android creates TCP connection spans which are noisy and not useful in most cases.
    // Unless the span has a child txn which would indicate a continuaton of the trace, we collapse it.
    if (node.value.op === 'http.client' && node.value.origin === 'auto.http.okhttp') {
      return true;
    }
  }

  return false;
}

export class TraceTreeNode<T extends TraceTree.NodeValue = TraceTree.NodeValue> {
  parent: TraceTreeNode | null = null;
  reparent_reason: 'pageload server handler' | null = null;

  fetchStatus: 'resolved' | 'error' | 'idle' | 'loading' = 'idle';
  value: T;

  canFetch = false;
  expanded = true;
  zoomedIn = false;

  metadata: TraceTree.Metadata = {
    project_slug: undefined,
    event_id: undefined,
    spans: undefined,
  };

  eapSpanOpsBreakdown: TraceTree.OpsBreakdown = [];

  event: EventTransaction | null = null;

  // Events associated with the node, these are inferred from the node value.
  errors = new Set<TraceTree.TraceErrorIssue>();
  occurrences = new Set<TraceTree.TraceOccurrence>();
  profiles: TraceTree.Profile[] = [];

  space: [number, number] = [0, 0];
  children: TraceTreeNode[] = [];

  depth: number | undefined;
  connectors: number[] | undefined;

  constructor(parent: TraceTreeNode | null, value: T, metadata: TraceTree.Metadata) {
    this.parent = parent ?? null;
    this.value = value;
    this.metadata = metadata;

    // The node can fetch its children if it has more than one span, or if we failed to fetch the span count.
    this.canFetch =
      typeof metadata.spans === 'number'
        ? metadata.spans > 1
        : isTraceTransaction(this.value);

    // If a node has both a start and end timestamp, then we can infer a duration,
    // otherwise we can only infer a timestamp.
    if (
      value &&
      (('end_timestamp' in value && typeof value.end_timestamp === 'number') ||
        ('timestamp' in value && typeof value.timestamp === 'number')) &&
      'start_timestamp' in value &&
      typeof value.start_timestamp === 'number'
    ) {
      const end_timestamp =
        'end_timestamp' in value ? value.end_timestamp : value.timestamp;
      this.space = [
        value.start_timestamp * 1e3,
        (end_timestamp - value.start_timestamp) * 1e3,
      ];
    } else if (value && 'timestamp' in value && typeof value.timestamp === 'number') {
      this.space = [value.timestamp * 1e3, 0];
    } else if (
      value &&
      'start_timestamp' in value &&
      typeof value.start_timestamp === 'number'
    ) {
      this.space = [value.start_timestamp * 1e3, 0];
    }

    if (value) {
      if ('errors' in value && Array.isArray(value.errors)) {
        value.errors.forEach(error => this.errors.add(error));
      }

      if ('performance_issues' in value && Array.isArray(value.performance_issues)) {
        value.performance_issues.forEach(issue => this.occurrences.add(issue));
      }

      // EAP spans can have occurences
      if ('occurrences' in value && Array.isArray(value.occurrences)) {
        value.occurrences.forEach(occurence => this.occurrences.add(occurence));
      }

      const isNonTransactionEAPSpan = isEAPSpan(value) && !value.is_transaction;

      if (!isNonTransactionEAPSpan) {
        if (
          'profile_id' in value &&
          typeof value.profile_id === 'string' &&
          value.profile_id.trim() !== ''
        ) {
          this.profiles.push({profile_id: value.profile_id});
        }
        if (
          'profiler_id' in value &&
          typeof value.profiler_id === 'string' &&
          value.profiler_id.trim() !== ''
        ) {
          this.profiles.push({profiler_id: value.profiler_id});
        }
      }
    }

    // For error nodes, its value is the only associated issue.
    if (isTraceError(this.value)) {
      this.errors.add(this.value);
    }

    // Android http spans generate sub spans for things like dns resolution in http requests,
    // which creates a lot of noise and is not useful to display.
    if (shouldCollapseNodeByDefault(this)) {
      this.expanded = false;
    }
  }

  get hasErrors(): boolean {
    return this.errors.size > 0 || this.occurrences.size > 0;
  }

  private _max_severity: keyof Theme['level'] | undefined;
  get maxIssueSeverity(): keyof Theme['level'] {
    if (this._max_severity) {
      return this._max_severity;
    }

    for (const error of this.errors) {
      if (error.level === 'error' || error.level === 'fatal') {
        this._max_severity = error.level;
        return this.maxIssueSeverity;
      }
    }

    return 'default';
  }

  invalidate() {
    this.connectors = undefined;
    this.depth = undefined;
  }

  static Root() {
    return new TraceTreeNode(null, null, {
      event_id: undefined,
      project_slug: undefined,
    });
  }
}
