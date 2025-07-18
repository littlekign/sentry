# Generated by Django 5.2.1 on 2025-06-20 15:54

import django.contrib.postgres.fields
from django.db import migrations, models

import sentry.db.models.fields.bounded
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
        ("replays", "0001_squashed_0005_drop_replay_index"),
    ]

    operations = [
        migrations.CreateModel(
            name="ReplayDeletionJobModel",
            fields=[
                (
                    "id",
                    sentry.db.models.fields.bounded.BoundedBigAutoField(
                        primary_key=True, serialize=False
                    ),
                ),
                ("date_updated", models.DateTimeField(auto_now=True)),
                ("date_added", models.DateTimeField(auto_now_add=True)),
                ("range_start", models.DateTimeField()),
                ("range_end", models.DateTimeField()),
                (
                    "environments",
                    django.contrib.postgres.fields.ArrayField(
                        base_field=models.TextField(), default=list, size=None
                    ),
                ),
                (
                    "organization_id",
                    sentry.db.models.fields.bounded.BoundedBigIntegerField(db_index=True),
                ),
                (
                    "project_id",
                    sentry.db.models.fields.bounded.BoundedBigIntegerField(db_index=True),
                ),
                ("status", models.CharField(default="pending")),
                ("query", models.TextField()),
                ("offset", models.IntegerField(default=0)),
            ],
            options={
                "db_table": "replays_replaydeletionjob",
            },
        ),
    ]
