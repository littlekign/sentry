# Generated by Django 5.2.1 on 2025-07-01 20:14

import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models

import sentry.db.models.fields.bounded
import sentry.db.models.fields.foreignkey
import sentry.users.models.user_merge_verification_code
from sentry.new_migrations.migrations import CheckedMigration


class Migration(CheckedMigration):
    # This flag is used to mark that a migration shouldn't be automatically run in production.
    # This should only be used for operations where it's safe to run the migration after your
    # code has deployed. So this should not be used for most operations that alter the schema
    # of a table.
    # Here are some things that make sense to mark as post deployment:
    # - Large data migrations. Typically we want these to be run manually so that they can be
    #   monitored and not block the deploy for a long period of time while they run.
    # - Adding indexes to large tables. Since this can take a long time, we'd generally prefer to
    #   run this outside deployments so that we don't block them. Note that while adding an index
    #   is a schema change, it's completely safe to run the operation after the code has deployed.
    # Once deployed, run these manually via: https://develop.sentry.dev/database-migrations/#migration-deployment

    is_post_deployment = False

    dependencies = [
        ("sentry", "0940_auditlog_json_field"),
    ]

    operations = [
        migrations.CreateModel(
            name="UserMergeVerificationCode",
            fields=[
                (
                    "id",
                    sentry.db.models.fields.bounded.BoundedBigAutoField(
                        primary_key=True, serialize=False
                    ),
                ),
                ("date_updated", models.DateTimeField(auto_now=True)),
                ("date_added", models.DateTimeField(auto_now_add=True)),
                (
                    "token",
                    models.CharField(
                        default=sentry.users.models.user_merge_verification_code.generate_token,
                        max_length=64,
                    ),
                ),
                (
                    "expires_at",
                    models.DateTimeField(
                        default=sentry.users.models.user_merge_verification_code.generate_expires_at
                    ),
                ),
                (
                    "user",
                    sentry.db.models.fields.foreignkey.FlexibleForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        to=settings.AUTH_USER_MODEL,
                        unique=True,
                    ),
                ),
            ],
            options={
                "db_table": "sentry_user_verification_codes_temp",
            },
        ),
    ]
