from datetime import timedelta
from time import time

from sentry.constants import ObjectStatus
from sentry.integrations.models.organization_integration import OrganizationIntegration
from sentry.integrations.types import IntegrationProviderSlug
from sentry.silo.base import SiloMode
from sentry.tasks.base import instrumented_task, retry
from sentry.taskworker.config import TaskworkerConfig
from sentry.taskworker.namespaces import integrations_control_tasks
from sentry.taskworker.retry import Retry


@instrumented_task(
    name="sentry.integrations.vsts.tasks.kickoff_vsts_subscription_check",
    queue="integrations.control",
    default_retry_delay=60 * 5,
    max_retries=5,
    silo_mode=SiloMode.CONTROL,
    taskworker_config=TaskworkerConfig(
        namespace=integrations_control_tasks,
        retry=Retry(
            times=5,
            delay=60 * 5,
        ),
    ),
)
@retry()
def kickoff_vsts_subscription_check() -> None:
    from sentry.integrations.vsts.tasks import vsts_subscription_check

    organization_integrations = OrganizationIntegration.objects.filter(
        integration__provider=IntegrationProviderSlug.AZURE_DEVOPS.value,
        integration__status=ObjectStatus.ACTIVE,
        status=ObjectStatus.ACTIVE,
    ).select_related("integration")

    six_hours_ago = time() - timedelta(hours=6).seconds
    for org_integration in organization_integrations:
        subscription = org_integration.integration.metadata.get("subscription")
        if subscription:
            check = subscription.get("check")
            if not check or check <= six_hours_ago:
                vsts_subscription_check.apply_async(
                    kwargs={
                        "integration_id": org_integration.integration_id,
                        "organization_id": org_integration.organization_id,
                    }
                )
