from __future__ import annotations

import logging
from collections import defaultdict
from collections.abc import Mapping, Sequence
from typing import Any, NamedTuple

from sentry.integrations.models.repository_project_path_config import RepositoryProjectPathConfig
from sentry.integrations.source_code_management.repo_trees import (
    RepoAndBranch,
    RepoTree,
    RepoTreesIntegration,
)
from sentry.models.organization import Organization
from sentry.models.project import Project
from sentry.models.repository import Repository
from sentry.utils import metrics
from sentry.utils.event_frames import EventFrame, try_munge_frame_path

from .constants import METRIC_PREFIX
from .errors import (
    DoesNotFollowJavaPackageNamingConvention,
    MissingModuleOrAbsPath,
    NeedsExtension,
    UnexpectedPathException,
    UnsupportedFrameInfo,
)
from .frame_info import FrameInfo, create_frame_info
from .integration_utils import InstallationNotFoundError, get_installation
from .utils.misc import get_straight_path_prefix_end_index

logger = logging.getLogger(__name__)


class CodeMapping(NamedTuple):
    repo: RepoAndBranch
    stacktrace_root: str
    source_path: str


SLASH = "/"
BACKSLASH = "\\"  # This is the Python representation of a single backslash


def derive_code_mappings(
    organization: Organization,
    frame: Mapping[str, Any],
    platform: str | None = None,
) -> list[dict[str, str]]:
    installation = get_installation(organization)
    if not isinstance(installation, RepoTreesIntegration):
        return []
    trees = installation.get_trees_for_org()
    trees_helper = CodeMappingTreesHelper(trees)
    try:
        frame_filename = create_frame_info(frame, platform)
        return trees_helper.get_file_and_repo_matches(frame_filename)
    except NeedsExtension:
        logger.warning("Needs extension: %s", frame.get("filename"))

    return []


# call generate_code_mappings() after you initialize CodeMappingTreesHelper
class CodeMappingTreesHelper:
    platform: str | None = None

    def __init__(self, trees: Mapping[str, RepoTree]):
        self.trees = trees
        self.code_mappings: dict[str, CodeMapping] = {}

    def generate_code_mappings(
        self, frames: Sequence[Mapping[str, Any]], platform: str | None = None
    ) -> list[CodeMapping]:
        """Generate code mappings based on the initial trees object and the list of stack traces"""
        # We need to make sure that calling this method with a new list of stack traces
        # should always start with a clean slate
        self.code_mappings = {}
        self.platform = platform

        with metrics.timer(
            f"{METRIC_PREFIX}.generate_code_mappings.duration", tags={"platform": platform}
        ):
            buckets: dict[str, list[FrameInfo]] = self._stacktrace_buckets(frames)

            # We reprocess stackframes until we are told that no code mappings were produced
            # This is order to reprocess past stackframes in light of newly discovered code mappings
            # This allows for idempotency since the order of the stackframes will not matter
            # This has no performance issue because stackframes that match an existing code mapping
            # will be skipped
            while True:
                if not self._process_stackframes(buckets):
                    break

        return list(self.code_mappings.values())

    def get_file_and_repo_matches(self, frame_filename: FrameInfo) -> list[dict[str, str]]:
        """List all the files in a repo that match the frame_filename"""
        file_matches = []
        for repo_full_name in self.trees.keys():
            repo_tree = self.trees[repo_full_name]
            matches = [
                src_path
                for src_path in repo_tree.files
                if self._is_potential_match(src_path, frame_filename)
            ]

            for file in matches:
                stack_path = frame_filename.raw_path
                source_path = file
                extra = {"stack_path": stack_path, "source_path": source_path}

                try:
                    stack_root, source_root = find_roots(frame_filename, source_path)
                except UnexpectedPathException:
                    logger.warning("Unexpected format for stack_path or source_path", extra=extra)
                    continue

                extra.update({"stack_root": stack_root, "source_root": source_root})
                if stack_path.replace(stack_root, source_root, 1).replace("\\", "/") != source_path:
                    logger.warning(
                        "Unexpected stack_path/source_path found. A code mapping was not generated.",
                        extra=extra,
                    )
                else:
                    file_matches.append(
                        {
                            "filename": file,
                            "repo_name": repo_tree.repo.name,
                            "repo_branch": repo_tree.repo.branch,
                            "stacktrace_root": stack_root,
                            "source_path": source_root,
                        }
                    )
        return file_matches

    def _stacktrace_buckets(
        self, frames: Sequence[Mapping[str, Any]]
    ) -> dict[str, list[FrameInfo]]:
        """Groups stacktraces into buckets based on the root of the stacktrace path"""
        buckets: defaultdict[str, list[FrameInfo]] = defaultdict(list)
        for frame in frames:
            try:
                frame_filename = create_frame_info(frame, self.platform)
                # Any files without a top directory will be grouped together
                buckets[frame_filename.stack_root].append(frame_filename)
            except UnsupportedFrameInfo:
                logger.warning("Frame's filepath not supported: %s", frame.get("filename"))
            except MissingModuleOrAbsPath:
                logger.warning("Do not panic. I'm collecting this data.")
            except NeedsExtension:
                logger.warning("Needs extension: %s", frame.get("filename"))
            except DoesNotFollowJavaPackageNamingConvention:
                pass
            except Exception:
                logger.exception("Unable to split stacktrace path into buckets")

        return buckets

    def _process_stackframes(self, buckets: Mapping[str, Sequence[FrameInfo]]) -> bool:
        """This processes all stackframes and returns if a new code mapping has been generated"""
        reprocess = False
        for stackframe_root, stackframes in buckets.items():
            if not self.code_mappings.get(stackframe_root):
                for frame_filename in stackframes:
                    code_mapping = self._find_code_mapping(frame_filename)
                    if code_mapping:
                        # This allows processing some stack frames that
                        # were matching more than one file
                        reprocess = True
                        self.code_mappings[stackframe_root] = code_mapping
        return reprocess

    def _find_code_mapping(self, frame_filename: FrameInfo) -> CodeMapping | None:
        """Look for the file path through all the trees and a generate code mapping for it if a match is found"""
        code_mappings: list[CodeMapping] = []
        # XXX: This will need optimization by changing the data structure of the trees
        for repo_full_name in self.trees.keys():
            try:
                code_mappings.extend(
                    self._generate_code_mapping_from_tree(
                        self.trees[repo_full_name], frame_filename
                    )
                )
            except NotImplementedError:
                logger.exception(
                    "Code mapping failed for module with no package name. Processing continues."
                )
            except Exception:
                logger.exception("Unexpected error. Processing continues.")

        if len(code_mappings) == 0:
            logger.warning("No files matched for %s", frame_filename.raw_path)
            return None
        # This means that the file has been found in more than one repo
        elif len(code_mappings) > 1:
            logger.warning("More than one repo matched %s", frame_filename.raw_path)
            return None

        return code_mappings[0]

    def _generate_code_mapping_from_tree(
        self,
        repo_tree: RepoTree,
        frame_filename: FrameInfo,
    ) -> list[CodeMapping]:
        """
        Finds a match in the repo tree and generates a code mapping for it. At most one code mapping is generated, if any.
        If more than one potential match is found, do not generate a code mapping and return an empty list.
        """
        matched_files = [
            src_path
            for src_path in repo_tree.files
            if self._is_potential_match(src_path, frame_filename)
        ]

        if len(matched_files) != 1:
            return []

        stack_path = frame_filename.raw_path
        source_path = matched_files[0]

        extra = {"stack_path": stack_path, "source_path": source_path}
        try:
            stack_root, source_root = find_roots(frame_filename, source_path)
        except UnexpectedPathException:
            logger.warning("Unexpected format for stack_path or source_path", extra=extra)
            return []

        extra.update({"stack_root": stack_root, "source_root": source_root})
        if stack_path.replace(stack_root, source_root, 1).replace("\\", "/") != source_path:
            logger.warning(
                "Unexpected stack_path/source_path found. A code mapping was not generated.",
                extra=extra,
            )
            return []

        return [
            CodeMapping(
                repo=repo_tree.repo,
                stacktrace_root=stack_root,
                source_path=source_root,
            )
        ]

    def _is_potential_match(self, src_file: str, frame_filename: FrameInfo) -> bool:
        """
        Tries to see if the stacktrace without the root matches the file from the
        source code. Use existing code mappings to exclude some source files
        """

        def _list_endswith(l1: Sequence[str], l2: Sequence[str]) -> bool:
            if len(l2) > len(l1):
                l1, l2 = l2, l1
            l1_idx = len(l1) - 1
            l2_idx = len(l2) - 1

            while l2_idx >= 0:
                if l2[l2_idx] != l1[l1_idx]:
                    return False
                l1_idx -= 1
                l2_idx -= 1
            return True

        # Exit early because we should not be processing source files for existing code maps
        if self._matches_existing_code_mappings(src_file):
            return False

        src_file_items = src_file.split("/")
        frame_items = frame_filename.normalized_path.split("/")

        if len(src_file_items) > len(frame_items):  # Mono repos
            return _list_endswith(src_file_items, frame_items)
        elif len(frame_items) > len(src_file_items):  # Absolute paths
            return _list_endswith(frame_items, src_file_items)
        else:  # exact match
            return src_file == frame_filename.normalized_path

    def _matches_existing_code_mappings(self, src_file: str) -> bool:
        """Check if the source file is already covered by an existing code mapping"""
        return any(
            code_mapping.source_path
            for code_mapping in self.code_mappings.values()
            if src_file.startswith(f"{code_mapping.source_path}/")
        )

    def __repr__(self) -> str:
        return f"CodeMappingTreesHelper(trees={self.trees}, code_mappings={self.code_mappings})"


def convert_stacktrace_frame_path_to_source_path(
    frame: EventFrame,
    code_mapping: RepositoryProjectPathConfig,
    platform: str | None,
    sdk_name: str | None,
) -> str | None:
    """
    Applies the given code mapping to the given stacktrace frame and returns the source path.

    If the code mapping does not apply to the frame, returns None.
    """

    stack_root = code_mapping.stack_root

    # In most cases, code mappings get applied to frame.filename, but some platforms such as Java
    # contain folder info in other parts of the frame (e.g. frame.module="com.example.app.MainActivity"
    # gets transformed to "com/example/app/MainActivity.java"), so in those cases we use the
    # transformed path instead.
    stacktrace_path = (
        try_munge_frame_path(frame=frame, platform=platform, sdk_name=sdk_name) or frame.filename
    )

    if stacktrace_path and stacktrace_path.startswith(code_mapping.stack_root):
        return (
            stacktrace_path.replace(stack_root, code_mapping.source_root, 1)
            .replace("\\", "/")
            .lstrip("/")
        )

    # Some platforms only provide the file's name without folder paths, so we
    # need to use the absolute path instead. If the code mapping has a non-empty
    # stack_root value and it matches the absolute path, we do the mapping on it.
    if frame.abs_path and frame.abs_path.startswith(code_mapping.stack_root):
        return (
            frame.abs_path.replace(stack_root, code_mapping.source_root, 1)
            .replace("\\", "/")
            .lstrip("/")
        )

    return None


def create_code_mapping(
    organization: Organization,
    code_mapping: CodeMapping,
    project: Project,
) -> RepositoryProjectPathConfig:
    installation = get_installation(organization)
    # It helps with typing since org_integration can be None
    if not installation.org_integration:
        raise InstallationNotFoundError

    repository, _ = Repository.objects.get_or_create(
        name=code_mapping.repo.name,
        organization_id=organization.id,
        defaults={"integration_id": installation.model.id},
    )
    new_code_mapping, _ = RepositoryProjectPathConfig.objects.update_or_create(
        project=project,
        stack_root=code_mapping.stacktrace_root,
        defaults={
            "repository": repository,
            "organization_id": organization.id,
            "integration_id": installation.model.id,
            "organization_integration_id": installation.org_integration.id,
            "source_root": code_mapping.source_path,
            "default_branch": code_mapping.repo.branch,
            # This function is called from the UI, thus, we know that the code mapping is user generated
            "automatically_generated": False,
        },
    )

    return new_code_mapping


def get_sorted_code_mapping_configs(project: Project) -> list[RepositoryProjectPathConfig]:
    """
    Returns the code mapping config list for a project sorted based on precedence.
    User generated code mappings are evaluated before Sentry generated code mappings.
    Code mappings with absolute path stack roots are evaluated before relative path stack roots.
    Code mappings with more defined stack trace roots are evaluated before less defined stack trace
    roots.

    `project`: The project to get the list of sorted code mapping configs for
    """

    # xxx(meredith): if there are ever any changes to this query, make
    # sure that we are still ordering by `id` because we want to make sure
    # the ordering is deterministic
    # codepath mappings must have an associated integration for stacktrace linking.
    configs = RepositoryProjectPathConfig.objects.filter(
        project=project, organization_integration_id__isnull=False
    )

    sorted_configs: list[RepositoryProjectPathConfig] = []

    try:
        for config in configs:
            inserted = False
            for index, sorted_config in enumerate(sorted_configs):
                # This check will ensure that all user defined code mappings will come before Sentry generated ones
                if (
                    (sorted_config.automatically_generated and not config.automatically_generated)
                    or (  # Insert absolute paths before relative paths
                        not sorted_config.stack_root.startswith("/")
                        and config.stack_root.startswith("/")
                    )
                    or (  # Insert more defined stack roots before less defined ones
                        (sorted_config.automatically_generated == config.automatically_generated)
                        and config.stack_root.startswith(sorted_config.stack_root)
                    )
                ):
                    sorted_configs.insert(index, config)
                    inserted = True
                    break
            if not inserted:
                # Insert the code mapping at the back if it's Sentry generated or at the front if it is user defined
                if config.automatically_generated:
                    sorted_configs.insert(len(sorted_configs), config)
                else:
                    sorted_configs.insert(0, config)
    except Exception:
        logger.exception("There was a failure sorting the code mappings")

    return sorted_configs


def find_roots(frame_filename: FrameInfo, source_path: str) -> tuple[str, str]:
    """
    Returns a tuple containing the stack_root, and the source_root.
    If there is no overlap, raise an exception since this should not happen
    """
    stack_path = frame_filename.raw_path
    stack_root = ""
    if stack_path[0] == "/" or stack_path[0] == "\\":
        stack_root += stack_path[0]
        stack_path = stack_path[1:]

    if stack_path == source_path:
        return (stack_root, "")
    elif source_path.endswith(stack_path):  # "Packaged" logic
        source_prefix = source_path.rpartition(stack_path)[0]
        return (
            f"{stack_root}{frame_filename.stack_root}/".replace("//", "/"),
            f"{source_prefix}{frame_filename.stack_root}/".replace("//", "/"),
        )
    elif stack_path.endswith(source_path):
        stack_prefix = stack_path.rpartition(source_path)[0]
        return (f"{stack_root}{stack_prefix}", "")

    stack_path_delim = SLASH if SLASH in stack_path else BACKSLASH
    if stack_path_delim == BACKSLASH:
        stack_path = stack_path.replace(BACKSLASH, SLASH)
    if (straight_path_idx := get_straight_path_prefix_end_index(stack_path)) > 0:
        stack_root += stack_path[:straight_path_idx]
        stack_path = stack_path[straight_path_idx:]

    overlap_to_check: list[str] = stack_path.split(SLASH)
    stack_root_items: list[str] = []

    while overlap_to_check:
        if (overlap := SLASH.join(overlap_to_check)) and source_path.endswith(overlap):
            source_root = source_path.rpartition(overlap)[0]
            stack_root += stack_path_delim.join(stack_root_items)

            if stack_root and stack_root[-1] != stack_path_delim:  # append trailing slash
                stack_root = f"{stack_root}{stack_path_delim}"
            if source_root and source_root[-1] != SLASH:
                source_root = f"{source_root}{SLASH}"

            return (stack_root, source_root)

        # increase stack root specificity, decrease overlap specifity
        stack_root_items.append(overlap_to_check.pop(0))

    # validate_source_url should have ensured the file names match
    # so if we get here something went wrong and there is a bug
    raise UnexpectedPathException("Could not find common root from paths")
