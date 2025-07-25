from __future__ import annotations

from typing import Any
from unittest import TestCase

from sentry.eventtypes.error import ErrorEvent
from sentry.testutils.pytest.fixtures import django_db_all


class GetMetadataTest(TestCase):
    def test_simple(self) -> None:
        inst = ErrorEvent()
        data = {"exception": {"values": [{"type": "Exception", "value": "Foo"}]}}
        assert inst.get_metadata(data) == {
            "type": "Exception",
            "value": "Foo",
        }

    def test_no_exception_type_or_value(self) -> None:
        inst = ErrorEvent()
        data: dict[str, dict[str, Any]] = {
            "exception": {"values": [{"type": None, "value": None, "stacktrace": {}}]}
        }
        assert inst.get_metadata(data) == {
            "type": "Error",
            "value": "",
        }

    def test_pulls_top_function(self) -> None:
        inst = ErrorEvent()
        data = {
            "platform": "native",
            "exception": {
                "values": [
                    {
                        "stacktrace": {
                            "frames": [
                                {"in_app": True, "function": "void top_func(int)"},
                                {"in_app": False, "function": "void invalid_func(int)"},
                                {"in_app": True, "function": "<unknown>"},
                            ]
                        }
                    }
                ]
            },
        }
        assert inst.get_metadata(data) == {
            "type": "Error",
            "value": "",
            "function": "top_func",
        }

    def test_none_frame(self) -> None:
        inst = ErrorEvent()
        data = {"exception": {"values": [{"stacktrace": {"frames": [None]}}]}}
        assert inst.get_metadata(data) == {
            "type": "Error",
            "value": "",
        }

    def test_multiple_exceptions_default(self) -> None:
        inst = ErrorEvent()
        data = {
            "exception": {
                "values": [
                    {"type": "Exception", "value": "Bar"},
                    {"type": "Exception", "value": "Foo"},
                ]
            }
        }
        assert inst.get_metadata(data) == {
            "type": "Exception",
            "value": "Foo",
        }

    def test_multiple_exceptions_main_indicated(self) -> None:
        inst = ErrorEvent()
        data = {
            "main_exception_id": 1,
            "exception": {
                "values": [
                    {"type": "Exception", "value": "Bar", "mechanism": {"exception_id": 1}},
                    {"type": "Exception", "value": "Foo", "mechanism": {"exception_id": 0}},
                ]
            },
        }
        assert inst.get_metadata(data) == {
            "type": "Exception",
            "value": "Bar",
        }


@django_db_all
class GetTitleTest(TestCase):
    def test_none_value(self) -> None:
        inst = ErrorEvent()
        result = inst.get_title({"type": "Error", "value": None})
        assert result == "Error"

    def test_trims_value_at_newline(self) -> None:
        inst = ErrorEvent()
        result = inst.get_title({"type": "Error", "value": "foo\nbar"})
        assert result == "Error: foo"

    def test_handles_empty_value(self) -> None:
        inst = ErrorEvent()
        result = inst.get_title({"type": "Error", "value": ""})
        assert result == "Error"
