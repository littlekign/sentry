from unittest import mock

from sentry.deletions.tasks.scheduled import run_scheduled_deletions
from sentry.models.environment import Environment
from sentry.models.project import Project
from sentry.monitors.models import (
    CheckInStatus,
    Monitor,
    MonitorCheckIn,
    MonitorEnvironment,
    ScheduleType,
)
from sentry.testutils.cases import APITestCase, TransactionTestCase
from sentry.testutils.hybrid_cloud import HybridCloudTestMixin


class DeleteMonitorEnvironmentTest(APITestCase, TransactionTestCase, HybridCloudTestMixin):
    def test_simple(self) -> None:
        project = self.create_project(name="test")
        env = Environment.objects.create(organization_id=project.organization_id, name="foo")
        env_2 = Environment.objects.create(organization_id=project.organization_id, name="bar")

        monitor = Monitor.objects.create(
            organization_id=project.organization.id,
            project_id=project.id,
            config={"schedule": "* * * * *", "schedule_type": ScheduleType.CRONTAB},
        )
        monitor_env = MonitorEnvironment.objects.create(
            monitor=monitor,
            environment_id=env.id,
        )
        monitor_env_2 = MonitorEnvironment.objects.create(
            monitor=monitor,
            environment_id=env_2.id,
        )
        checkin = MonitorCheckIn.objects.create(
            monitor=monitor,
            monitor_environment=monitor_env,
            project_id=project.id,
            date_added=monitor.date_added,
            status=CheckInStatus.OK,
        )
        checkin_2 = MonitorCheckIn.objects.create(
            monitor=monitor,
            monitor_environment=monitor_env_2,
            project_id=project.id,
            date_added=monitor.date_added,
            status=CheckInStatus.OK,
        )

        self.ScheduledDeletion.schedule(instance=monitor_env, days=0)

        with self.tasks():
            run_scheduled_deletions()

        assert not MonitorEnvironment.objects.filter(id=monitor_env.id).exists()
        assert not MonitorCheckIn.objects.filter(id=checkin.id).exists()

        # Shared objects should continue to exist.
        assert Monitor.objects.filter(id=monitor.id).exists()
        assert MonitorEnvironment.objects.filter(id=monitor_env_2.id).exists()
        assert MonitorCheckIn.objects.filter(id=checkin_2.id).exists()
        assert Environment.objects.filter(id=env.id).exists()
        assert Project.objects.filter(id=project.id).exists()

    def test_relocated(self) -> None:
        project = self.create_project(name="test")
        env = Environment.objects.create(organization_id=project.organization_id, name="foo")
        monitor = Monitor.objects.create(
            organization_id=project.organization.id,
            project_id=project.id,
            config={"schedule": "* * * * *", "schedule_type": ScheduleType.CRONTAB},
        )
        monitor_env = MonitorEnvironment.objects.create(
            monitor=monitor,
            environment_id=env.id,
        )

        # Fake the app_label back to the sentry app to test the
        # RELOCATED_MODELS mapping
        with mock.patch.object(monitor_env._meta, "app_label", "sentry"), self.tasks():
            self.ScheduledDeletion.schedule(instance=monitor_env, days=0)
            run_scheduled_deletions()

        assert not MonitorEnvironment.objects.filter(id=monitor_env.id).exists()
