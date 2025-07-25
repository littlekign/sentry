import {Fragment} from 'react';
import styled from '@emotion/styled';

import AnalyticsArea from 'sentry/components/analyticsArea';
import {Button} from 'sentry/components/core/button';
import {LinkButton} from 'sentry/components/core/button/linkButton';
import {ExternalLink} from 'sentry/components/core/link';
import {useFeatureFlagOnboarding} from 'sentry/components/events/featureFlags/onboarding/useFeatureFlagOnboarding';
import FieldGroup from 'sentry/components/forms/fieldGroup';
import Panel from 'sentry/components/panels/panel';
import PanelBody from 'sentry/components/panels/panelBody';
import PanelHeader from 'sentry/components/panels/panelHeader';
import SentryDocumentTitle from 'sentry/components/sentryDocumentTitle';
import {t, tct} from 'sentry/locale';
import useOrganization from 'sentry/utils/useOrganization';
import SettingsPageHeader from 'sentry/views/settings/components/settingsPageHeader';
import TextBlock from 'sentry/views/settings/components/text/textBlock';

function OrganizationFeatureFlagsIndex() {
  const organization = useOrganization();
  const {activateSidebar} = useFeatureFlagOnboarding({projectPlatform: undefined});

  return (
    <Fragment>
      <SentryDocumentTitle title={t('Feature Flags')} orgSlug={organization.slug} />
      <SettingsPageHeader title={t('Feature Flags')} />
      <TextBlock>
        {tct(
          'Integrating Sentry with your feature flag provider enables Sentry to correlate feature flag changes with new error events and mark certain changes as suspicious. To learn more about our feature flag features, [link:read our docs].',
          {
            link: (
              <ExternalLink href="https://docs.sentry.io/product/issues/issue-details/feature-flags/" />
            ),
          }
        )}
      </TextBlock>

      <Panel>
        <PanelHeader>{t('Features')}</PanelHeader>
        <PanelBody>
          <FieldGroup
            alignRight
            flexibleControlStateSize
            label={<Large>{t('Evaluation Tracking')}</Large>}
            help={t(
              'Evaluation tracking enables Sentry to capture flag values on your error events. Flag evaluations will appear in the "Feature Flags" section of the Issue Details page.'
            )}
          >
            <Button
              aria-label={t('Set Up Evaluation Tracking')}
              onClick={mouseEvent => {
                activateSidebar(mouseEvent);
              }}
            >
              {t('Set Up Project')}
            </Button>
          </FieldGroup>
          <FieldGroup
            alignRight
            flexibleControlStateSize
            label={<Large>{t('Change Tracking')}</Large>}
            help={t(
              'Change tracking enables Sentry to listen for additions, removals, and modifications to your feature flags.'
            )}
          >
            <LinkButton
              to={`/settings/${organization.slug}/feature-flags/change-tracking/`}
            >
              {t('Manage Providers')}
            </LinkButton>
          </FieldGroup>
        </PanelBody>
      </Panel>
    </Fragment>
  );
}

export default function OrganizationFeatureFlagsIndexRoute() {
  return (
    <AnalyticsArea name="feature_flag_org_settings">
      <OrganizationFeatureFlagsIndex />
    </AnalyticsArea>
  );
}

const Large = styled('span')`
  font-size: ${p => p.theme.fontSize.lg};
`;
