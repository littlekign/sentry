from django.urls import reverse

from sentry.auth.authenticators.totp import TotpInterface
from sentry.testutils.cases import APITestCase
from sentry.testutils.silo import control_silo_test


@control_silo_test
class UserAuthenticatorIndexTest(APITestCase):
    def test_list_all_authenticators(self) -> None:
        user = self.create_user(email="a@example.com", is_superuser=True)
        self.login_as(user=user, superuser=True)
        url = reverse("sentry-api-0-user-authenticator-index", kwargs={"user_id": "me"})

        resp = self.client.get(url, format="json")

        assert resp.status_code == 200
        interface = [i for i in resp.data if i["id"] == "totp"][0]
        assert not interface["isEnrolled"]

        # Enroll in Totp - should still be listed
        TotpInterface().enroll(user)

        resp = self.client.get(url, format="json")
        assert resp.status_code == 200
        interface = [i for i in resp.data if i["id"] == "totp"][0]
        assert interface["isEnrolled"]
