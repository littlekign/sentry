import logging

from snuba_sdk import Column, Condition

from sentry.search.eap.resolver import SearchResolver
from sentry.search.eap.types import SearchResolverConfig
from sentry.search.eap.uptime_results.definitions import UPTIME_RESULT_DEFINITIONS
from sentry.search.events.types import EventsResponse, SnubaParams
from sentry.snuba.dataset import Dataset
from sentry.snuba.metrics.extraction import MetricSpecType
from sentry.snuba.query_sources import QuerySource
from sentry.snuba.rpc_dataset_common import TableQuery, run_table_query

logger = logging.getLogger("sentry.snuba.uptime_results")


def get_resolver(params: SnubaParams, config: SearchResolverConfig) -> SearchResolver:
    return SearchResolver(
        params=params,
        config=config,
        definitions=UPTIME_RESULT_DEFINITIONS,
    )


def query(
    selected_columns: list[str],
    query: str,
    snuba_params: SnubaParams,
    equations: list[str] | None = None,
    orderby: list[str] | None = None,
    offset: int | None = None,
    limit: int = 50,
    referrer: str | None = None,
    auto_fields: bool = False,
    auto_aggregations: bool = False,
    include_equation_fields: bool = False,
    allow_metric_aggregates: bool = False,
    use_aggregate_conditions: bool = False,
    conditions: list[Condition] | None = None,
    functions_acl: list[str] | None = None,
    transform_alias_to_input_format: bool = False,
    sample: float | None = None,
    has_metrics: bool = False,
    use_metrics_layer: bool = False,
    skip_tag_resolution: bool = False,
    extra_columns: list[Column] | None = None,
    on_demand_metrics_enabled: bool = False,
    on_demand_metrics_type: MetricSpecType | None = None,
    dataset: Dataset = Dataset.Discover,
    fallback_to_transactions: bool = False,
    query_source: QuerySource | None = None,
    debug: bool = False,
) -> EventsResponse:
    return run_table_query(
        TableQuery(
            query_string=query or "",
            selected_columns=selected_columns,
            orderby=orderby or [],
            offset=offset or 0,
            limit=limit,
            referrer=referrer or "referrer unset",
            sampling_mode=None,
            resolver=get_resolver(
                params=snuba_params,
                config=SearchResolverConfig(
                    auto_fields=auto_fields,
                    use_aggregate_conditions=use_aggregate_conditions,
                ),
            ),
        ),
        debug=debug,
    )
