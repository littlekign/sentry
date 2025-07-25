from __future__ import annotations

from collections.abc import Collection, Iterable, Mapping, Sequence
from dataclasses import dataclass
from datetime import datetime
from enum import Enum
from typing import TYPE_CHECKING, Any, Literal, TypedDict, TypeIs, TypeVar, Union

from sentry.utils.services import Service

if TYPE_CHECKING:
    from sentry.snuba.sessions_v2 import QueryDefinition

ProjectId = int
OrganizationId = int
ReleaseName = str
EnvironmentName = str
DateString = str

SnubaAppID = "metrics.release_health"

#: The functions supported by `run_sessions_query`
SessionsQueryFunction = Literal[
    "sum(session)",
    "count_unique(user)",
    "avg(session.duration)",
    "p50(session.duration)",
    "p75(session.duration)",
    "p90(session.duration)",
    "p95(session.duration)",
    "p99(session.duration)",
    "max(session.duration)",
    "crash_rate(session)",
    "crash_rate(user)",
    "crash_free_rate(session)",
    "crash_free_rate(user)",
    "anr_rate()",
    "foreground_anr_rate()",
]

GroupByFieldName = Literal[
    "project",
    "release",
    "environment",
    "session.status",
]
FilterFieldName = Literal["project", "release", "environment"]


class AllowedResolution(Enum):
    one_hour = (3600, "one hour")
    one_minute = (60, "one minute")
    ten_seconds = (10, "ten seconds")


@dataclass(frozen=True)
class SessionsQueryConfig:
    """Backend-dependent config for sessions_v2 query"""

    allowed_resolution: AllowedResolution
    allow_session_status_query: bool
    restrict_date_range: bool


class SessionsQuery(TypedDict):
    org_id: OrganizationId
    project_ids: Sequence[ProjectId]
    select_fields: Sequence[SessionsQueryFunction]
    filter_query: Mapping[FilterFieldName, str]
    start: datetime
    end: datetime
    rollup: int  # seconds


SessionsQueryValue = Union[None, float]

ProjectWithCount = tuple[ProjectId, int]

#: Group key as featured in output format
GroupKeyDict = TypedDict(
    "GroupKeyDict",
    {"project": int, "release": str, "environment": str, "session.status": str},
    total=False,
)


class SessionsQueryGroup(TypedDict):
    by: GroupKeyDict
    series: dict[SessionsQueryFunction, list[SessionsQueryValue]]
    totals: dict[SessionsQueryFunction, SessionsQueryValue]


class SessionsQueryResult(TypedDict):
    start: datetime
    end: datetime
    intervals: list[DateString]
    groups: list[SessionsQueryGroup]
    query: str


FormattedIsoTime = str

ProjectRelease = tuple[ProjectId, ReleaseName]
ProjectOrRelease = TypeVar("ProjectOrRelease", ProjectId, ProjectRelease)

# taken from sentry.snuba.sessions.STATS_PERIODS
StatsPeriod = Literal[
    "1h",
    "24h",
    "1d",
    "48h",
    "2d",
    "7d",
    "14d",
    "30d",
    "90d",
]

OverviewStat = Literal["users", "sessions"]


def is_overview_stat(s: str) -> TypeIs[OverviewStat]:
    return s in ("users", "sessions")


class CurrentAndPreviousCrashFreeRate(TypedDict):
    currentCrashFreeRate: float | None
    previousCrashFreeRate: float | None


CurrentAndPreviousCrashFreeRates = Mapping[ProjectId, CurrentAndPreviousCrashFreeRate]


class _TimeBounds(TypedDict):
    sessions_lower_bound: FormattedIsoTime
    sessions_upper_bound: FormattedIsoTime


class _NoTimeBounds(TypedDict):
    sessions_lower_bound: None
    sessions_upper_bound: None


ReleaseSessionsTimeBounds = Union[_TimeBounds, _NoTimeBounds]

# Inner list is supposed to be fixed length
ReleaseHealthStats = Sequence[Sequence[int]]


class ReleaseAdoption(TypedDict):
    #: Adoption rate (based on usercount) for a project's release from 0..100
    adoption: float | None
    #: Adoption rate (based on sessioncount) for a project's release from 0..100
    sessions_adoption: float | None
    #: User count for a project's release (past 24h)
    users_24h: int | None
    #: Sessions count for a project's release (past 24h)
    sessions_24h: int | None
    #: Sessions count for the entire project (past 24h)
    project_users_24h: int | None
    #: Sessions count for the entire project (past 24h)
    project_sessions_24h: int | None


ReleasesAdoption = Mapping[tuple[ProjectId, ReleaseName], ReleaseAdoption]


class ReleaseHealthOverview(TypedDict, total=False):
    adoption: float | None
    sessions_adoption: float | None
    total_users_24h: int | None
    total_project_users_24h: int | None
    total_sessions_24h: int | None
    total_project_sessions_24h: int | None
    total_sessions: int | None
    total_users: int | None
    has_health_data: bool
    sessions_crashed: int
    crash_free_users: float | None
    crash_free_sessions: float | None
    sessions_errored: int
    duration_p50: float | None
    duration_p90: float | None
    stats: Mapping[StatsPeriod, ReleaseHealthStats]


class CrashFreeBreakdown(TypedDict):
    date: datetime
    total_users: int
    crash_free_users: float | None
    total_sessions: int
    crash_free_sessions: float | None


class DurationPercentiles(TypedDict):
    duration_p50: float | None
    duration_p90: float | None


class UserCounts(TypedDict):
    users: int
    users_healthy: int
    users_crashed: int
    users_abnormal: int
    users_errored: int


class UserCountsAndPercentiles(DurationPercentiles, UserCounts):
    pass


class SessionCounts(TypedDict):
    sessions: int
    sessions_healthy: int
    sessions_crashed: int
    sessions_abnormal: int
    sessions_errored: int


class SessionCountsAndPercentiles(DurationPercentiles, SessionCounts):
    pass


# NOTE: Tuple is the wrong type, it's a fixed-length list. Unfortunately mypy
# is too opinionated to support fixed-length lists.
ProjectReleaseUserStats = tuple[Sequence[tuple[int, UserCountsAndPercentiles]], UserCounts]
ProjectReleaseSessionStats = tuple[
    Sequence[tuple[int, SessionCountsAndPercentiles]],
    SessionCounts,
]


class ReleaseHealthBackend(Service):
    """Abstraction layer for all release health related queries"""

    __all__ = (
        "get_current_and_previous_crash_free_rates",
        "get_release_adoption",
        "check_has_health_data",
        "get_release_sessions_time_bounds",
        "check_releases_have_health_data",
        "sessions_query_config",
        "run_sessions_query",
        "get_release_health_data_overview",
        "get_crash_free_breakdown",
        "get_changed_project_release_model_adoptions",
        "get_oldest_health_data_for_releases",
        "get_project_releases_count",
        "get_project_release_stats",
        "get_project_sessions_count",
        "get_num_sessions_per_project",
        "get_project_releases_by_stability",
    )

    def get_current_and_previous_crash_free_rates(
        self,
        project_ids: Sequence[ProjectId],
        current_start: datetime,
        current_end: datetime,
        previous_start: datetime,
        previous_end: datetime,
        rollup: int,
        org_id: OrganizationId | None = None,
    ) -> CurrentAndPreviousCrashFreeRates:
        """
        Function that returns `currentCrashFreeRate` and the `previousCrashFreeRate` of projects
        based on the inputs provided
        Inputs:
            * project_ids
            * current_start: start interval of currentCrashFreeRate
            * current_end: end interval of currentCrashFreeRate
            * previous_start: start interval of previousCrashFreeRate
            * previous_end: end interval of previousCrashFreeRate
            * rollup
        Returns:
            A dictionary of project_id as key and as value the `currentCrashFreeRate` and the
            `previousCrashFreeRate`

            As an example:
            {
                1: {
                    "currentCrashFreeRate": 100,
                    "previousCrashFreeRate": 66.66666666666667
                },
                2: {
                    "currentCrashFreeRate": 50.0,
                    "previousCrashFreeRate": None
                },
                ...
            }
        """
        raise NotImplementedError()

    def get_release_adoption(
        self,
        project_releases: Sequence[ProjectRelease],
        environments: Sequence[EnvironmentName] | None = None,
        now: datetime | None = None,
        org_id: OrganizationId | None = None,
    ) -> ReleasesAdoption:
        """
        Get the adoption of the last 24 hours (or a difference reference timestamp).

        :param project_releases: A list of releases to get adoption for. Our
            backends store session data per-project, so each release has to be
            scoped down to a project too.

        :param environments: Optional. A list of environments to filter by.
        :param now: Release adoption information will be provided from 24h ago
            until this timestamp.
        :param org_id: An organization ID to filter by. Note that all projects
            have to be within this organization, and this backend doesn't check for
            that. Omit if you're not sure.
        """

        raise NotImplementedError()

    def sessions_query_config(self, organization: Any) -> SessionsQueryConfig:
        """Return the backend-dependent config for sessions_v2.QueryDefinition"""
        raise NotImplementedError()

    def run_sessions_query(
        self,
        org_id: int,
        query: QueryDefinition,
        span_op: str,
    ) -> SessionsQueryResult:
        """
        Runs the `query` as defined by the sessions_v2 [`QueryDefinition`],
        and returns the resulting timeseries in sessions_v2 format.
        """
        raise NotImplementedError()

    def get_release_sessions_time_bounds(
        self,
        project_id: ProjectId,
        release: ReleaseName,
        org_id: OrganizationId,
        environments: Iterable[str] | None = None,
    ) -> ReleaseSessionsTimeBounds:
        """
        Get the sessions time bounds in terms of when the first session started and
        when the last session started according to a specific (project_id, org_id, release, environments)
        combination
        Inputs:
            * project_id
            * release
            * org_id: Organization Id
            * environments
        Return:
            Dictionary with two keys "sessions_lower_bound" and "sessions_upper_bound" that
        correspond to when the first session occurred and when the last session occurred respectively
        """
        raise NotImplementedError()

    def check_has_health_data(
        self,
        projects_list: Collection[ProjectOrRelease],
        now: datetime | None = None,
    ) -> set[ProjectOrRelease]:
        """
        Function that returns a set of all project_ids or (project, release) if they have health data
        within the last 90 days based on a list of projects or a list of project, release combinations
        provided as an arg.
        Inputs:
            * projects_list: Contains either a list of project ids or a list of tuple (project_id,
            release)
        """
        raise NotImplementedError()

    def check_releases_have_health_data(
        self,
        organization_id: OrganizationId,
        project_ids: Sequence[ProjectId],
        release_versions: Sequence[ReleaseName],
        start: datetime,
        end: datetime,
    ) -> set[ReleaseName]:
        """
        Returns a set of all release versions that have health data within a given period of time.
        """

        raise NotImplementedError()

    def get_release_health_data_overview(
        self,
        project_releases: Sequence[ProjectRelease],
        environments: Sequence[EnvironmentName] | None = None,
        summary_stats_period: StatsPeriod | None = None,
        health_stats_period: StatsPeriod | None = None,
        stat: Literal["users", "sessions"] | None = None,
        now: datetime | None = None,
    ) -> Mapping[ProjectRelease, ReleaseHealthOverview]:
        """Checks quickly for which of the given project releases we have
        health data available.  The argument is a tuple of `(project_id, release_name)`
        tuples.  The return value is a set of all the project releases that have health
        data.
        """

        raise NotImplementedError()

    def get_crash_free_breakdown(
        self,
        project_id: ProjectId,
        release: ReleaseName,
        start: datetime,
        environments: Sequence[EnvironmentName] | None = None,
        now: datetime | None = None,
    ) -> Sequence[CrashFreeBreakdown]:
        """Get stats about crash free sessions and stats for the last 1, 2, 7, 14 and 30 days"""
        raise NotImplementedError

    def get_changed_project_release_model_adoptions(
        self,
        project_ids: Iterable[int],
        now: datetime | None = None,
    ) -> Sequence[ProjectRelease]:
        """
        Returns a sequence of tuples (ProjectId, ReleaseName) with the
        releases seen in the last 72 hours for the requested projects.
        """
        raise NotImplementedError()

    def get_oldest_health_data_for_releases(
        self,
        project_releases: Sequence[ProjectRelease],
        now: datetime | None = None,
    ) -> Mapping[ProjectRelease, str]:
        """Returns the oldest health data we have observed in a release
        in 90 days.  This is used for backfilling.
        """
        raise NotImplementedError()

    def get_project_releases_count(
        self,
        organization_id: OrganizationId,
        project_ids: Sequence[ProjectId],
        scope: str,
        stats_period: str | None = None,
        environments: Sequence[EnvironmentName] | None = None,
    ) -> int:
        """
        Fetches the total count of releases/project combinations
        """
        raise NotImplementedError()

    def get_project_release_stats(
        self,
        project_id: ProjectId,
        release: ReleaseName,
        stat: OverviewStat,
        rollup: int,
        start: datetime,
        end: datetime,
        environments: Sequence[EnvironmentName] | None = None,
    ) -> ProjectReleaseUserStats | ProjectReleaseSessionStats:
        raise NotImplementedError()

    def get_project_sessions_count(
        self,
        project_id: ProjectId,
        rollup: int,  # rollup in seconds
        start: datetime,
        end: datetime,
        environment_id: int | None = None,
    ) -> int:
        """
        Returns the number of sessions in the specified period (optionally
        filtered by environment)
        """
        raise NotImplementedError()

    def get_num_sessions_per_project(
        self,
        project_ids: Sequence[ProjectId],
        start: datetime | None,
        end: datetime | None,
        environment_ids: Sequence[int] | None = None,
        rollup: int | None = None,  # rollup in seconds
    ) -> Sequence[ProjectWithCount]:
        """
        Returns the number of sessions for each project specified.
        Additionally
        """
        raise NotImplementedError()

    def get_project_releases_by_stability(
        self,
        project_ids: Sequence[ProjectId],
        offset: int | None,
        limit: int | None,
        scope: str,
        stats_period: str | None = None,
        environments: Sequence[str] | None = None,
        now: datetime | None = None,
    ) -> Sequence[ProjectRelease]:
        """Given some project IDs returns adoption rates that should be updated
        on the postgres tables.
        """
        raise NotImplementedError()
