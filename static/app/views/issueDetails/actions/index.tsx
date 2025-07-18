import type {MouseEvent} from 'react';
import {Fragment, useMemo} from 'react';
import styled from '@emotion/styled';

import {bulkDelete, bulkUpdate} from 'sentry/actionCreators/group';
import {
  addLoadingMessage,
  addSuccessMessage,
  clearIndicators,
} from 'sentry/actionCreators/indicator';
import type {ModalRenderProps} from 'sentry/actionCreators/modal';
import {openModal, openReprocessEventModal} from 'sentry/actionCreators/modal';
import Feature from 'sentry/components/acl/feature';
import FeatureDisabled from 'sentry/components/acl/featureDisabled';
import ArchiveActions, {getArchiveActions} from 'sentry/components/actions/archive';
import ResolveActions from 'sentry/components/actions/resolve';
import {renderArchiveReason} from 'sentry/components/archivedBox';
import GuideAnchor from 'sentry/components/assistant/guideAnchor';
import {openConfirmModal} from 'sentry/components/confirm';
import {Button} from 'sentry/components/core/button';
import {LinkButton} from 'sentry/components/core/button/linkButton';
import {Flex} from 'sentry/components/core/layout';
import {DropdownMenu} from 'sentry/components/dropdownMenu';
import {EnvironmentPageFilter} from 'sentry/components/organizations/environmentPageFilter';
import {renderResolutionReason} from 'sentry/components/resolutionBox';
import {
  IconCheckmark,
  IconEllipsis,
  IconSubscribed,
  IconUnsubscribed,
  IconUpload,
} from 'sentry/icons';
import {t} from 'sentry/locale';
import GroupStore from 'sentry/stores/groupStore';
import IssueListCacheStore from 'sentry/stores/IssueListCacheStore';
import {space} from 'sentry/styles/space';
import type {Event} from 'sentry/types/event';
import type {Group, GroupStatusResolution, MarkReviewed} from 'sentry/types/group';
import {GroupStatus, GroupSubstatus} from 'sentry/types/group';
import type {SavedQueryVersions} from 'sentry/types/organization';
import type {Project} from 'sentry/types/project';
import {trackAnalytics} from 'sentry/utils/analytics';
import {getUtcDateString} from 'sentry/utils/dates';
import EventView from 'sentry/utils/discover/eventView';
import {DiscoverDatasets, SavedQueryDatasets} from 'sentry/utils/discover/types';
import {displayReprocessEventAction} from 'sentry/utils/displayReprocessEventAction';
import {getAnalyticsDataForGroup} from 'sentry/utils/events';
import {uniqueId} from 'sentry/utils/guid';
import {getConfigForIssueType} from 'sentry/utils/issueTypeConfig';
import {getAnalyicsDataForProject} from 'sentry/utils/projects';
import {useQueryClient} from 'sentry/utils/queryClient';
import useApi from 'sentry/utils/useApi';
import {useLocation} from 'sentry/utils/useLocation';
import {useNavigate} from 'sentry/utils/useNavigate';
import useOrganization from 'sentry/utils/useOrganization';
import {hasDatasetSelector} from 'sentry/views/dashboards/utils';
import {NewIssueExperienceButton} from 'sentry/views/issueDetails/actions/newIssueExperienceButton';
import ShareIssueModal from 'sentry/views/issueDetails/actions/shareModal';
import SubscribeAction from 'sentry/views/issueDetails/actions/subscribeAction';
import {Divider} from 'sentry/views/issueDetails/divider';
import {makeFetchGroupQueryKey} from 'sentry/views/issueDetails/useGroup';
import {
  useEnvironmentsFromUrl,
  useHasStreamlinedUI,
} from 'sentry/views/issueDetails/utils';

type UpdateData =
  | {isBookmarked: boolean}
  | {isSubscribed: boolean}
  | MarkReviewed
  | GroupStatusResolution;

const isResolutionStatus = (data: UpdateData): data is GroupStatusResolution => {
  return (data as GroupStatusResolution).status !== undefined;
};

interface GroupActionsProps {
  disabled: boolean;
  event: Event | null;
  group: Group;
  project: Project;
}

export function GroupActions({group, project, disabled, event}: GroupActionsProps) {
  const api = useApi({persistInFlight: true});
  const organization = useOrganization();
  const navigate = useNavigate();
  const location = useLocation();
  const hasStreamlinedUI = useHasStreamlinedUI();
  const queryClient = useQueryClient();
  const environments = useEnvironmentsFromUrl();

  const bookmarkKey = group.isBookmarked ? 'unbookmark' : 'bookmark';
  const bookmarkTitle = group.isBookmarked ? t('Remove bookmark') : t('Bookmark');
  const hasRelease = !!project.features?.includes('releases');
  const isResolved = group.status === 'resolved';
  const isAutoResolved =
    group.status === 'resolved' ? group.statusDetails.autoResolved : undefined;
  const isIgnored = group.status === 'ignored';

  const hasDeleteAccess = organization.access.includes('event:admin');

  const config = useMemo(() => getConfigForIssueType(group, project), [group, project]);

  const {
    actions: {
      archiveUntilOccurrence: archiveUntilOccurrenceCap,
      delete: deleteCap,
      deleteAndDiscard: deleteDiscardCap,
      resolve: resolveCap,
      resolveInRelease: resolveInReleaseCap,
      share: shareCap,
    },
    customCopy: {resolution: resolvedCopyCap},
    discover: discoverCap,
  } = config;

  const getDiscoverUrl = () => {
    const {title, type, shortId} = group;

    const discoverQuery = {
      id: undefined,
      name: title || type,
      fields: ['title', 'release', 'environment', 'user.display', 'timestamp'],
      orderby: '-timestamp',
      query: `issue:${shortId}`,
      projects: [Number(project.id)],
      version: 2 as SavedQueryVersions,
      range: '90d',
      dataset: config.usesIssuePlatform ? DiscoverDatasets.ISSUE_PLATFORM : undefined,
    };

    const discoverView = EventView.fromSavedQuery(discoverQuery);
    return discoverView.getResultsViewUrlTarget(
      organization,
      false,
      hasDatasetSelector(organization) ? SavedQueryDatasets.ERRORS : undefined
    );
  };

  const trackIssueAction = (
    action:
      | 'shared'
      | 'deleted'
      | 'bookmarked'
      | 'subscribed'
      | 'mark_reviewed'
      | 'discarded'
      | 'open_in_discover'
      | GroupStatus,
    substatus?: GroupSubstatus | null,
    statusDetailsKey?: string
  ) => {
    const {alert_date, alert_rule_id, alert_type} = location.query;
    trackAnalytics('issue_details.action_clicked', {
      organization,
      action_type: action,
      action_substatus: substatus ?? undefined,
      action_status_details: statusDetailsKey,
      // Alert properties track if the user came from email/slack alerts
      alert_date:
        typeof alert_date === 'string' ? getUtcDateString(Number(alert_date)) : undefined,
      alert_rule_id: typeof alert_rule_id === 'string' ? alert_rule_id : undefined,
      alert_type: typeof alert_type === 'string' ? alert_type : undefined,
      ...getAnalyticsDataForGroup(group),
      ...getAnalyicsDataForProject(project),
      org_streamline_only: organization.streamlineOnly ?? undefined,
    });
  };

  const onDelete = () => {
    addLoadingMessage(t('Delete event\u2026'));

    bulkDelete(
      api,
      {
        orgId: organization.slug,
        projectId: project.slug,
        itemIds: [group.id],
      },
      {
        complete: () => {
          clearIndicators();

          addSuccessMessage(t('Issue deleted'));
          navigate({
            pathname: `/organizations/${organization.slug}/issues/`,
            query: {project: project.id},
          });
        },
      }
    );

    trackIssueAction('deleted');
    IssueListCacheStore.reset();
  };

  const onUpdate = (data: UpdateData, onComplete?: () => void) => {
    bulkUpdate(
      api,
      {
        orgId: organization.slug,
        projectId: project.slug,
        itemIds: [group.id],
        data,
      },
      {
        complete: () => {
          clearIndicators();
          onComplete?.();
          queryClient.invalidateQueries({
            queryKey: makeFetchGroupQueryKey({
              organizationSlug: organization.slug,
              groupId: group.id,
              environments,
            }),
          });
        },
      }
    );

    if (isResolutionStatus(data)) {
      trackIssueAction(
        data.status,
        data.substatus,
        Object.keys(data.statusDetails || {})[0]
      );
    }
    if ((data as {inbox: boolean}).inbox !== undefined) {
      trackIssueAction('mark_reviewed');
    }
    IssueListCacheStore.reset();
  };

  const onReprocessEvent = () => {
    openReprocessEventModal({organization, groupId: group.id});
  };

  const onTogglePublicShare = () => {
    const newIsPublic = !group.isPublic;
    if (newIsPublic) {
      trackAnalytics('issue.shared_publicly', {
        organization,
      });
    }
    trackIssueAction('shared');
  };

  const onToggleBookmark = () => {
    onUpdate({isBookmarked: !group.isBookmarked}, () => {
      trackIssueAction('bookmarked');
      addSuccessMessage(
        group.isBookmarked ? t('Issue bookmark removed') : t('Issue bookmarked')
      );
    });
  };

  const onToggleSubscribe = () => {
    onUpdate({isSubscribed: !group.isSubscribed}, () => {
      trackIssueAction('subscribed');
      addSuccessMessage(
        group.isSubscribed ? t('Unsubscribed from issue') : t('Subscribed to issue')
      );
    });
  };

  const onDiscard = () => {
    const id = uniqueId();
    addLoadingMessage(t('Discarding event\u2026'));

    GroupStore.onDiscard(id, group.id);

    api.request(`/issues/${group.id}/`, {
      method: 'PUT',
      data: {discard: true},
      success: response => {
        GroupStore.onDiscardSuccess(id, group.id, response);
        navigate({
          pathname: `/organizations/${organization.slug}/issues/`,
          query: {project: project.id},
        });
      },
      error: error => {
        GroupStore.onDiscardError(id, group.id, error);
      },
      complete: clearIndicators,
    });
    trackIssueAction('discarded');
    IssueListCacheStore.reset();
  };

  const renderDiscardModal = ({Body, Footer, closeModal}: ModalRenderProps) => {
    function renderDiscardDisabled({children, ...innerProps}: any) {
      return children({
        ...innerProps,
        renderDisabled: ({features}: {features: string[]}) => (
          <FeatureDisabled
            alert
            featureName={t('Discard and Delete')}
            features={features}
          />
        ),
      });
    }

    return (
      <Feature
        features="projects:discard-groups"
        hookName="feature-disabled:discard-groups"
        organization={organization}
        project={project}
        renderDisabled={renderDiscardDisabled}
      >
        {({hasFeature, renderDisabled, ...innerProps}) => (
          <Fragment>
            <Body>
              {!hasFeature &&
                typeof renderDisabled === 'function' &&
                renderDisabled({...innerProps, hasFeature, children: null})}
              {t(
                `Discarding this event will result in the deletion of most data associated with this issue and future events being discarded before reaching your stream. Are you sure you wish to continue?`
              )}
            </Body>
            <Footer>
              <Button onClick={closeModal}>{t('Cancel')}</Button>
              <Button
                style={{marginLeft: space(1)}}
                priority="primary"
                onClick={onDiscard}
                disabled={!hasFeature}
              >
                {t('Discard Future Events')}
              </Button>
            </Footer>
          </Fragment>
        )}
      </Feature>
    );
  };

  const openDeleteModal = () =>
    openConfirmModal({
      message: t('Deleting this issue is permanent. Are you sure you wish to continue?'),
      priority: 'danger',
      confirmText: t('Delete'),
      onConfirm: onDelete,
    });

  const openDiscardModal = () => {
    openModal(renderDiscardModal);
  };

  const openShareModal = () => {
    openModal(modalProps => (
      <ShareIssueModal
        {...modalProps}
        organization={organization}
        groupId={group.id}
        event={event}
        onToggle={onTogglePublicShare}
        projectSlug={project.slug}
        hasIssueShare={shareCap.enabled}
      />
    ));
  };

  const handleClick = (onClick: (event?: MouseEvent) => void) => {
    return function (innerEvent: MouseEvent) {
      if (disabled) {
        innerEvent.preventDefault();
        innerEvent.stopPropagation();
        return;
      }

      onClick(innerEvent);
    };
  };

  const {dropdownItems: archiveDropdownItems} = getArchiveActions({
    onUpdate,
  });
  return (
    <ActionWrapper>
      {hasStreamlinedUI &&
        (isResolved || isIgnored ? (
          <ResolvedActionWapper>
            <ResolvedWrapper>
              <IconCheckmark size="md" />
              <Flex direction="column">
                {isResolved ? resolvedCopyCap || t('Resolved') : t('Archived')}
                <ReasonBanner>
                  {group.status === 'resolved'
                    ? renderResolutionReason({
                        statusDetails: group.statusDetails,
                        activities: group.activity,
                        hasStreamlinedUI,
                        project,
                        organization,
                      })
                    : null}
                  {group.status === 'ignored'
                    ? renderArchiveReason({
                        substatus: group.substatus,
                        statusDetails: group.statusDetails,
                        organization,
                        hasStreamlinedUI,
                      })
                    : null}
                </ReasonBanner>
              </Flex>
            </ResolvedWrapper>

            <Divider />
            {resolveCap.enabled && (
              <Button
                size="sm"
                disabled={disabled || isAutoResolved}
                onClick={() =>
                  onUpdate({
                    status: GroupStatus.UNRESOLVED,
                    statusDetails: {},
                    substatus: GroupSubstatus.ONGOING,
                  })
                }
              >
                {isResolved ? t('Unresolve') : t('Unarchive')}
              </Button>
            )}
          </ResolvedActionWapper>
        ) : (
          <Fragment>
            {resolveCap.enabled && (
              <ResolveActions
                disableResolveInRelease={!resolveInReleaseCap.enabled}
                disabled={disabled}
                disableDropdown={disabled}
                hasRelease={hasRelease}
                latestRelease={project.latestRelease}
                onUpdate={onUpdate}
                projectSlug={project.slug}
                isResolved={isResolved}
                isAutoResolved={isAutoResolved}
                size="sm"
                priority="primary"
              />
            )}
            <ArchiveActions
              className={hasStreamlinedUI ? undefined : 'hidden-xs'}
              size="sm"
              isArchived={isIgnored}
              onUpdate={onUpdate}
              disabled={disabled}
              disableArchiveUntilOccurrence={!archiveUntilOccurrenceCap.enabled}
            />
            {!hasStreamlinedUI && (
              <SubscribeAction
                className={hasStreamlinedUI ? undefined : 'hidden-xs'}
                disabled={disabled}
                disablePriority
                group={group}
                onClick={handleClick(onToggleSubscribe)}
                icon={group.isSubscribed ? <IconSubscribed /> : <IconUnsubscribed />}
                size="sm"
              />
            )}
          </Fragment>
        ))}
      {hasStreamlinedUI && (
        <Fragment>
          <SubscribeAction
            className={hasStreamlinedUI ? undefined : 'hidden-xs'}
            disabled={disabled}
            disablePriority
            group={group}
            onClick={handleClick(onToggleSubscribe)}
            icon={group.isSubscribed ? <IconSubscribed /> : <IconUnsubscribed />}
            size="sm"
          />
          <Button
            size="sm"
            onClick={openShareModal}
            icon={<IconUpload />}
            aria-label={t('Share')}
            title={t('Share Issue')}
            disabled={disabled}
            analyticsEventKey="issue_details.share_action_clicked"
            analyticsEventName="Issue Details: Share Action Clicked"
          />
        </Fragment>
      )}
      <DropdownMenu
        triggerProps={{
          'aria-label': t('More Actions'),
          icon: <IconEllipsis />,
          showChevron: false,
          size: 'sm',
        }}
        items={[
          // XXX: Never show for streamlined UI
          ...(isIgnored || hasStreamlinedUI
            ? []
            : [
                {
                  key: 'Archive',
                  className: hasStreamlinedUI
                    ? undefined
                    : 'hidden-sm hidden-md hidden-lg',
                  label: t('Archive'),
                  isSubmenu: true,
                  disabled,
                  children: archiveDropdownItems,
                },
              ]),
          // We don't hide the subscribe or discover button for streamlined UI
          ...(hasStreamlinedUI
            ? []
            : [
                {
                  key: 'share',
                  label: t('Share'),
                  onAction: openShareModal,
                  disabled,
                },
                {
                  key: group.isSubscribed ? 'unsubscribe' : 'subscribe',
                  className: 'hidden-sm hidden-md hidden-lg',
                  label: group.isSubscribed ? t('Unsubscribe') : t('Subscribe'),
                  disabled: disabled || group.subscriptionDetails?.disabled,
                  onAction: onToggleSubscribe,
                },
                {
                  key: 'open-in-discover',
                  className: 'hidden-sm hidden-md hidden-lg',
                  label: t('Open in Discover'),
                  to: disabled ? '' : getDiscoverUrl(),
                  onAction: () => trackIssueAction('open_in_discover'),
                },
              ]),
          {
            key: 'mark-review',
            label: t('Mark reviewed'),
            disabled: !group.inbox || disabled,
            details: !group.inbox || disabled ? t('Issue has been reviewed') : undefined,
            onAction: () => onUpdate({inbox: false}),
          },
          {
            key: bookmarkKey,
            label: bookmarkTitle,
            onAction: onToggleBookmark,
          },
          {
            key: 'reprocess',
            label: t('Reprocess events'),
            hidden: !displayReprocessEventAction(event),
            onAction: onReprocessEvent,
          },
          {
            key: 'delete-issue',
            priority: 'danger',
            label: t('Delete'),
            disabled: !hasDeleteAccess || !deleteCap.enabled,
            details: hasDeleteAccess
              ? deleteCap.disabledReason
              : t('Only admins can delete issues'),
            onAction: openDeleteModal,
          },
          {
            key: 'delete-and-discard',
            priority: 'danger',
            label: t('Delete and discard future events'),
            hidden: !hasDeleteAccess,
            disabled: !deleteDiscardCap.enabled,
            details: deleteDiscardCap.disabledReason,
            onAction: openDiscardModal,
          },
        ]}
      />
      {!hasStreamlinedUI && (
        <Fragment>
          <NewIssueExperienceButton />
          <SubscribeAction
            className="hidden-xs"
            disabled={disabled}
            disablePriority
            group={group}
            onClick={handleClick(onToggleSubscribe)}
            icon={group.isSubscribed ? <IconSubscribed /> : <IconUnsubscribed />}
            size="sm"
          />
          <div className="hidden-xs">
            <EnvironmentPageFilter position="bottom-end" size="sm" />
          </div>
          {discoverCap.enabled && (
            <Feature
              hookName="feature-disabled:open-in-discover"
              features="discover-basic"
              organization={organization}
            >
              <LinkButton
                className="hidden-xs"
                disabled={disabled}
                to={disabled ? '' : getDiscoverUrl()}
                onClick={() => trackIssueAction('open_in_discover')}
                size="sm"
              >
                {t('Open in Discover')}
              </LinkButton>
            </Feature>
          )}
          {isResolved || isIgnored ? (
            <Button
              priority="primary"
              title={
                isAutoResolved
                  ? t(
                      'This event is resolved due to the Auto Resolve configuration for this project'
                    )
                  : t('Change status to unresolved')
              }
              size="sm"
              disabled={disabled || isAutoResolved || !resolveCap.enabled}
              onClick={() =>
                onUpdate({
                  status: GroupStatus.UNRESOLVED,
                  statusDetails: {},
                  substatus: GroupSubstatus.ONGOING,
                })
              }
            >
              {isIgnored ? t('Archived') : t('Resolved')}
            </Button>
          ) : (
            <Fragment>
              <ArchiveActions
                className="hidden-xs"
                size="sm"
                isArchived={isIgnored}
                onUpdate={onUpdate}
                disabled={disabled}
                disableArchiveUntilOccurrence={!archiveUntilOccurrenceCap.enabled}
              />
              {resolveCap.enabled && (
                <GuideAnchor target="resolve" position="bottom" offset={20}>
                  <ResolveActions
                    disableResolveInRelease={!resolveInReleaseCap.enabled}
                    disabled={disabled}
                    disableDropdown={disabled}
                    hasRelease={hasRelease}
                    latestRelease={project.latestRelease}
                    onUpdate={onUpdate}
                    projectSlug={project.slug}
                    isResolved={isResolved}
                    isAutoResolved={isAutoResolved}
                    size="sm"
                    priority="primary"
                  />
                </GuideAnchor>
              )}
            </Fragment>
          )}
        </Fragment>
      )}
    </ActionWrapper>
  );
}

const ActionWrapper = styled('div')`
  display: flex;
  align-items: center;
  gap: ${space(0.5)};
`;

const ResolvedWrapper = styled('div')`
  display: flex;
  gap: ${space(1.5)};
  align-items: center;
  color: ${p => p.theme.green400};
  font-weight: bold;
  font-size: ${p => p.theme.fontSize.lg};
`;

const ResolvedActionWapper = styled('div')`
  display: flex;
  gap: ${space(1)};
  align-items: center;
`;

const ReasonBanner = styled('div')`
  font-weight: normal;
  color: ${p => p.theme.green400};
  font-size: ${p => p.theme.fontSize.sm};
`;
