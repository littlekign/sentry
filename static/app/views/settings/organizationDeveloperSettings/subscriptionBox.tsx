import styled from '@emotion/styled';

import {FeatureBadge} from 'sentry/components/core/badge/featureBadge';
import {Checkbox} from 'sentry/components/core/checkbox';
import {Tooltip} from 'sentry/components/core/tooltip';
import {t} from 'sentry/locale';
import {space} from 'sentry/styles/space';
import type {Organization} from 'sentry/types/organization';
import withOrganization from 'sentry/utils/withOrganization';
import type {EVENT_CHOICES} from 'sentry/views/settings/organizationDeveloperSettings/constants';
import {PERMISSIONS_MAP} from 'sentry/views/settings/organizationDeveloperSettings/constants';

type Resource = (typeof EVENT_CHOICES)[number];

type Props = {
  checked: boolean;
  disabledFromPermissions: boolean;
  isNew: boolean;
  onChange: (resource: Resource, checked: boolean) => void;
  organization: Organization;
  resource: Resource;
  webhookDisabled?: boolean;
};

function SubscriptionBox({
  checked,
  disabledFromPermissions,
  isNew,
  onChange,
  organization,
  resource,
  webhookDisabled = false,
}: Props) {
  const {features} = organization;

  let disabled = disabledFromPermissions || webhookDisabled;
  let message = t(
    "Must have at least 'Read' permissions enabled for %s",
    PERMISSIONS_MAP[resource]
  );

  if (resource === 'error' && !features.includes('integrations-event-hooks')) {
    disabled = true;
    message = t(
      'Your organization does not have access to the error subscription resource.'
    );
  }

  if (webhookDisabled) {
    message = t('Cannot enable webhook subscription without specifying a webhook url');
  }

  const DESCRIPTIONS: Record<(typeof EVENT_CHOICES)[number], string> = {
    issue: `created, resolved, assigned, archived, unresolved`,
    error: 'created',
    comment: 'created, edited, deleted',
  };

  return (
    <Tooltip disabled={!disabled} title={message} key={resource}>
      <SubscriptionGridItem disabled={disabled}>
        <SubscriptionInfo>
          <SubscriptionTitle>
            {resource}
            {isNew && <FeatureBadge type="new" />}
          </SubscriptionTitle>
          <SubscriptionDescription>{DESCRIPTIONS[resource]}</SubscriptionDescription>
        </SubscriptionInfo>
        <Checkbox
          key={`${resource}${checked}`}
          aria-label={resource}
          disabled={disabled}
          id={resource}
          value={resource}
          checked={checked}
          onChange={evt => onChange(resource, evt.target.checked)}
        />
      </SubscriptionGridItem>
    </Tooltip>
  );
}

export default withOrganization(SubscriptionBox);

const SubscriptionGridItem = styled('div')<{disabled: boolean}>`
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  background: ${p => p.theme.backgroundSecondary};
  opacity: ${p => (p.disabled ? 0.6 : 1)};
  border-radius: ${p => p.theme.borderRadius};
  cursor: ${p => (p.disabled ? 'not-allowed' : 'auto')};
  margin: ${space(1.5)};
  padding: ${space(1.5)};
  box-sizing: border-box;
`;

const SubscriptionInfo = styled('div')`
  display: flex;
  flex-direction: column;
  align-self: center;
`;

const SubscriptionDescription = styled('div')`
  font-size: ${p => p.theme.fontSize.md};
  line-height: 1;
  color: ${p => p.theme.subText};
`;

const SubscriptionTitle = styled('div')`
  font-size: ${p => p.theme.fontSize.lg};
  line-height: 1;
  color: ${p => p.theme.textColor};
  white-space: nowrap;
  margin-bottom: ${space(0.75)};
`;
