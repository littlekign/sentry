from django.urls import reverse

from sentry.testutils.cases import TestCase
from sentry.testutils.silo import all_silo_test


@all_silo_test
class Error500Test(TestCase):
    def test_renders(self) -> None:
        resp = self.client.get(reverse("error-500"))
        assert resp.status_code == 500
        self.assertTemplateUsed(resp, "sentry/500.html")
