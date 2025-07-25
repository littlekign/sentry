from __future__ import annotations

import logging

from django.http.response import HttpResponseBase

from sentry.hybridcloud.outbox.category import WebhookProviderIdentifier
from sentry.integrations.bitbucket_server.webhook import BitbucketServerWebhookEndpoint
from sentry.integrations.types import IntegrationProviderSlug
from sentry.middleware.integrations.parsers.bitbucket import BitbucketRequestParser

logger = logging.getLogger(__name__)


class BitbucketServerRequestParser(BitbucketRequestParser):
    provider = IntegrationProviderSlug.BITBUCKET_SERVER.value
    webhook_identifier = WebhookProviderIdentifier.BITBUCKET_SERVER

    def get_response(self) -> HttpResponseBase:
        if self.view_class == BitbucketServerWebhookEndpoint:
            return self.get_bitbucket_webhook_response()
        return self.get_response_from_control_silo()
