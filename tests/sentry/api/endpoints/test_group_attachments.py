from urllib.parse import urlencode

from sentry.models.eventattachment import EventAttachment
from sentry.testutils.cases import APITestCase
from sentry.testutils.helpers.datetime import before_now
from sentry.testutils.skips import requires_snuba

pytestmark = [requires_snuba]


class GroupEventAttachmentsTest(APITestCase):
    def create_attachment(self, type=None, event_id=None, file_name="hello.png", group_id=None):
        if type is None:
            type = "event.attachment"

        self.attachment = EventAttachment.objects.create(
            event_id=event_id or self.event.event_id,
            project_id=self.event.project_id,
            group_id=group_id or self.group.id,
            type=type,
            name=file_name,
            blob_path=":File contents here",
        )

        return self.attachment

    def path(self, types=None, event_ids=None, screenshot=False):
        path = f"/api/0/issues/{self.group.id}/attachments/"

        query = [("types", t) for t in types or ()]
        query.extend([("event_id", id) for id in event_ids or ()])
        if screenshot:
            query.append(("screenshot", 1))
        if query:
            path += "?" + urlencode(query)

        return path

    def test_basic(self) -> None:
        self.login_as(user=self.user)

        attachment = self.create_attachment()

        with self.feature("organizations:event-attachments"):
            response = self.client.get(self.path())

        assert response.status_code == 200, response.content
        assert len(response.data) == 1
        assert response.data[0]["id"] == str(attachment.id)

    def test_filter(self) -> None:
        self.login_as(user=self.user)

        self.create_attachment(type="event.attachment")
        attachment2 = self.create_attachment(type="event.minidump")

        with self.feature("organizations:event-attachments"):
            response = self.client.get(self.path(types=["event.minidump"]))

        assert response.status_code == 200, response.content
        assert len(response.data) == 1
        assert response.data[0]["id"] == str(attachment2.id)

    def test_screenshot_across_groups(self) -> None:
        self.login_as(user=self.user)

        min_ago = before_now(minutes=1).isoformat()
        group1_event = self.store_event(
            data={"fingerprint": ["group1"], "timestamp": min_ago}, project_id=self.project.id
        )
        self.create_attachment(file_name="screenshot.png", event_id=group1_event.event_id)
        self.create_attachment(file_name="screenshot-1.png", event_id=group1_event.event_id)
        # This will not be included as name doesn't contain 'screenshot'
        self.create_attachment(file_name="foo.png", event_id=group1_event.event_id)
        group2_event = self.store_event(
            data={"fingerprint": ["group2"], "timestamp": min_ago}, project_id=self.project.id
        )
        self.create_attachment(file_name="crash_screenshot.png", event_id=group2_event.event_id)

        with self.feature("organizations:event-attachments"):
            response = self.client.get(self.path(screenshot=True))

        assert response.status_code == 200, response.content
        assert len(response.data) == 3
        for attachment in response.data:
            # foo.png will not be included
            assert attachment["name"] in [
                "screenshot.png",
                "screenshot-1.png",
                "crash_screenshot.png",
            ]
            assert attachment["event_id"] in [group1_event.event_id, group2_event.event_id]

    def test_without_feature(self) -> None:
        self.login_as(user=self.user)
        self.create_attachment()

        with self.feature({"organizations:event-attachments": False}):
            response = self.client.get(self.path())

        assert response.status_code == 404, response.content

    def test_event_id_filter(self) -> None:
        self.login_as(user=self.user)
        attachment = self.create_attachment()
        self.create_attachment(event_id="b" * 32)

        with self.feature("organizations:event-attachments"):
            response = self.client.get(self.path(event_ids=[attachment.event_id]))

        assert response.status_code == 200, response.content
        assert len(response.data) == 1
        assert response.data[0]["event_id"] == attachment.event_id

    def test_multi_event_id_filter(self) -> None:
        self.login_as(user=self.user)
        attachment = self.create_attachment()
        attachment2 = self.create_attachment(event_id="b" * 32)
        self.create_attachment(event_id="c" * 32)

        with self.feature("organizations:event-attachments"):
            response = self.client.get(
                self.path(event_ids=[attachment.event_id, attachment2.event_id])
            )

        assert response.status_code == 200, response.content
        assert len(response.data) == 2
        assert response.data[0]["event_id"] == attachment2.event_id
        assert response.data[1]["event_id"] == attachment.event_id

    def test_date_range_filter(self) -> None:
        self.login_as(user=self.user)

        old_attachment = self.create_attachment(event_id="b" * 32)
        old_attachment.date_added = before_now(days=28).isoformat()
        old_attachment.save()

        newer_attachment = self.create_attachment(event_id="c" * 32)

        with self.feature("organizations:event-attachments"):
            all_response = self.client.get(f"/api/0/issues/{self.group.id}/attachments/")
        assert len(all_response.data) == 2

        with self.feature("organizations:event-attachments"):
            range_response = self.client.get(
                f"/api/0/issues/{self.group.id}/attachments/?statsPeriod=14d"
            )

        assert range_response.status_code == 200, range_response.content
        assert len(range_response.data) == 1
        assert range_response.data[0]["id"] == str(newer_attachment.id)
        assert range_response.data[0]["event_id"] == newer_attachment.event_id

    def test_event_environment_filter(self) -> None:
        self.login_as(user=self.user)
        data = {}

        for env in ["production", "development"]:
            event = self.store_event(
                data={
                    "fingerprint": ["same-group"],
                    "timestamp": before_now(days=1).isoformat(),
                    "environment": env,
                },
                project_id=self.project.id,
            )
            attachment = self.create_attachment(event_id=event.event_id, group_id=event.group_id)
            data[env] = (event, attachment)

        prod_event, prod_attachment = data["production"]
        assert prod_event.group is not None

        with self.feature("organizations:event-attachments"):
            all_response = self.client.get(f"/api/0/issues/{prod_event.group.id}/attachments/")
        assert len(all_response.data) == 2

        with self.feature("organizations:event-attachments"):
            prod_response = self.client.get(
                f"/api/0/issues/{prod_event.group.id}/attachments/?environment=production"
            )
        assert len(prod_response.data) == 1
        assert prod_response.data[0]["id"] == str(prod_attachment.id)
        assert prod_response.data[0]["event_id"] == prod_attachment.event_id

    def test_event_query_filter(self) -> None:
        self.login_as(user=self.user)
        data = {}

        for org in ["sentry", "not-sentry"]:
            event = self.store_event(
                data={
                    "fingerprint": ["same-group"],
                    "timestamp": before_now(days=1).isoformat(),
                    "tags": {"organization": org},
                },
                project_id=self.project.id,
            )
            attachment = self.create_attachment(event_id=event.event_id, group_id=event.group_id)
            data[org] = (event, attachment)

        sentry_event, sentry_attachment = data["sentry"]
        assert sentry_event.group is not None

        with self.feature("organizations:event-attachments"):
            all_response = self.client.get(f"/api/0/issues/{sentry_event.group.id}/attachments/")
        assert len(all_response.data) == 2

        with self.feature("organizations:event-attachments"):
            prod_response = self.client.get(
                f"/api/0/issues/{sentry_event.group.id}/attachments/?query=organization:sentry"
            )
        assert len(prod_response.data) == 1
        assert prod_response.data[0]["id"] == str(sentry_attachment.id)
        assert prod_response.data[0]["event_id"] == sentry_attachment.event_id

    def test_erroneous_event_filter(self) -> None:
        self.login_as(user=self.user)
        event = self.store_event(
            data={
                "fingerprint": ["same-group"],
                "timestamp": before_now(days=1).isoformat(),
                "tags": {"organization": "sentry"},
                "environment": "production",
            },
            project_id=self.project.id,
        )
        self.create_attachment(event_id=event.event_id, group_id=event.group_id)
        assert event.group is not None

        with self.feature("organizations:event-attachments"):
            response = self.client.get(
                f"/api/0/issues/{event.group.id}/attachments/?query=issue:None"
            )
        assert response.status_code == 400

    def test_event_filters_not_matching_should_return_no_attachments(self) -> None:
        self.login_as(user=self.user)

        self.create_environment(name="development", project=self.project)
        event = self.store_event(
            data={
                "fingerprint": ["same-group"],
                "timestamp": before_now(days=1).isoformat(),
                "tags": {"organization": "sentry"},
                "environment": "production",
            },
            project_id=self.project.id,
        )
        attachment = self.create_attachment(event_id=event.event_id, group_id=event.group_id)

        assert event.group is not None

        with self.feature("organizations:event-attachments"):
            response = self.client.get(f"/api/0/issues/{event.group.id}/attachments/")
        assert len(response.data) == 1
        assert response.data[0]["id"] == str(attachment.id)
        assert response.data[0]["event_id"] == attachment.event_id

        with self.feature("organizations:event-attachments"):
            response = self.client.get(
                f"/api/0/issues/{event.group.id}/attachments/?query=organization:acme"
            )
        assert len(response.data) == 0

        with self.feature("organizations:event-attachments"):
            response = self.client.get(
                f"/api/0/issues/{event.group.id}/attachments/?environment=development"
            )
        assert len(response.data) == 0
