from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Union

from parsimonious.exceptions import ParseError
from parsimonious.grammar import Grammar
from parsimonious.nodes import NodeVisitor

from sentry.exceptions import InvalidSearchQuery
from sentry.search.events.constants import TOTAL_COUNT_ALIAS, TOTAL_TRANSACTION_DURATION_ALIAS

# prefix on fields so we know they're equations
EQUATION_PREFIX = "equation|"
EQUATION_ALIAS_REGEX = re.compile(r"^equation\[\d*\]$")
SUPPORTED_OPERATORS = {"plus", "minus", "multiply", "divide"}


class ArithmeticError(Exception):
    pass


class MaxOperatorError(ArithmeticError):
    """Exceeded the maximum allowed operators"""


class ArithmeticParseError(ArithmeticError):
    """Encountered an error trying to parse an equation"""


class ArithmeticValidationError(ArithmeticError):
    """The math itself isn't valid"""


OperandType = Union["Operation", float, str]
JsonQueryType = list[Union[str, list[Union[str, float, None, "JsonQueryType"]]]]


class Operation:
    __slots__ = "operator", "lhs", "rhs"

    def __init__(
        self,
        operator: str,
        lhs: OperandType | None = None,
        rhs: OperandType | None = None,
    ) -> None:
        self.operator = operator
        self.lhs: OperandType | None = lhs
        self.rhs: OperandType | None = rhs
        self.validate()

    def validate(self) -> None:
        # This shouldn't really happen, but the operator value is based on the grammar so enforcing it to be safe
        if self.operator not in SUPPORTED_OPERATORS:
            raise ArithmeticParseError(f"{self.operator} is not a supported operator")

        if self.operator == "divide" and self.rhs == 0:
            raise ArithmeticValidationError("division by 0 is not allowed")

    def to_snuba_json(self, alias: str | None = None) -> JsonQueryType:
        """Convert this tree of Operations to the equivalent snuba json"""
        lhs = self.lhs.to_snuba_json() if isinstance(self.lhs, Operation) else self.lhs
        # TODO(snql): This is a hack so the json syntax doesn't turn lhs into a function
        if isinstance(lhs, str):
            lhs = ["toFloat64", [lhs]]
        rhs = self.rhs.to_snuba_json() if isinstance(self.rhs, Operation) else self.rhs
        result: JsonQueryType = [self.operator, [lhs, rhs]]
        if alias:
            result.append(alias)
        return result

    def __repr__(self) -> str:
        return repr([self.operator, self.lhs, self.rhs])


@dataclass(frozen=True)
class ParsedEquation:
    equation: Operation
    contains_functions: bool


def flatten(remaining):
    """Take all the remaining terms and reduce them to a single tree"""
    term = remaining.pop(0)
    while remaining:
        next_term = remaining.pop(0)
        if next_term.lhs is None:
            next_term.lhs = term
        term = next_term
    return term


arithmetic_grammar = Grammar(
    r"""
term                 = maybe_factor remaining_adds
remaining_adds       = add_sub*
add_sub              = add_sub_operator maybe_factor
maybe_factor         = spaces (factor / primary) spaces

factor               = primary remaining_muls
remaining_muls       = mul_div+
mul_div              = mul_div_operator primary

add_sub_operator     = spaces (plus / minus) spaces
mul_div_operator     = spaces (multiply / divide) spaces
primary              = spaces (parens / numeric_value / function_value / field_value) spaces

parens               = open_paren term closed_paren

# Operator names should match what's in clickhouse
plus                 = "+"
minus                = "-"
multiply             = "*"
divide               = ~r"[/÷]"

# Minor differences in parsing means that these cannot be shared with
# api/event_search. Arithmetic can support something like duration-duration as
# subtraction, but event_search needs to treat that as a single field since `-`
# is a valid tag character, which isn't supported in Arithmetic

function_value         = function_name open_paren spaces function_args? spaces closed_paren
function_args          = aggregate_param (spaces comma spaces aggregate_param)*
aggregate_param        = quoted_aggregate_param / raw_aggregate_param
raw_aggregate_param    = ~r"[^()\t\n, \"]+"
quoted_aggregate_param = '"' ('\\"' / ~r'[^\t\n\"]')* '"'
# Different from a field value, since a function arg may not be a valid field
function_name          = ~r"[a-zA-Z_0-9]+"
numeric_value          = ~r"[+-]?[0-9]+\.?[0-9]*"
field_value            = ~r"[a-zA-Z_\.]+"

comma                = ","
open_paren           = "("
closed_paren         = ")"
spaces               = " "*
"""
)


class ArithmeticVisitor(NodeVisitor):
    DEFAULT_MAX_OPERATORS = 10

    # Don't wrap in VisitationErrors
    unwrapped_exceptions = (ArithmeticError,)

    field_allowlist = {
        "transaction.duration",
        "spans.http",
        "spans.db",
        "spans.resource",
        "spans.browser",
        "spans.total.time",
        "measurements.app_start_cold",
        "measurements.app_start_warm",
        "measurements.cls",
        "measurements.fcp",
        "measurements.fid",
        "measurements.fp",
        "measurements.frames_frozen",
        "measurements.frames_slow",
        "measurements.frames_total",
        "measurements.lcp",
        "measurements.stall_count",
        "measurements.stall_stall_longest_time",
        "measurements.stall_stall_total_time",
        "measurements.time_to_full_display",
        "measurements.time_to_initial_display",
        "measurements.ttfb",
        "measurements.ttfb.requesttime",
        TOTAL_COUNT_ALIAS,
        TOTAL_TRANSACTION_DURATION_ALIAS,
    }
    function_allowlist = {
        "count",
        "count_if",
        "count_unique",
        "failure_count",
        "min",
        "max",
        "avg",
        "sum",
        "p50",
        "p75",
        "p95",
        "p99",
        "p100",
        "percentile",
        "apdex",
        "user_misery",
        "eps",
        "epm",
        "count_miserable",
        "count_web_vitals",
        "percentile_range",
    }

    def __init__(self, max_operators: int | None, custom_measurements: set[str] | None):
        super().__init__()
        self.operators: int = 0
        self.terms: int = 0
        self.max_operators = max_operators if max_operators else self.DEFAULT_MAX_OPERATORS
        self.fields: set[str] = set()
        self.functions: set[str] = set()
        self.custom_measurements: set[str] = custom_measurements or set()

    def visit_term(self, _, children):
        maybe_factor, remaining_adds = children
        maybe_factor = maybe_factor[0]
        # remaining_adds is either a list containing an Operation, or a Node
        if isinstance(remaining_adds, list):
            # Update the operation with lhs and continue
            remaining_adds[0].lhs = maybe_factor
            return flatten(remaining_adds)
        else:
            # if remaining is a node lhs contains a factor so just return that
            return maybe_factor

    def visit_factor(self, _, children):
        primary, remaining_muls = children
        remaining_muls[0].lhs = primary
        return flatten(remaining_muls)

    def visited_operator(self):
        """We visited an operator, increment the count and error if we exceed max"""
        self.operators += 1
        if self.operators > self.max_operators:
            raise MaxOperatorError("Exceeded maximum number of operations")

    def visit_add_sub(self, _, children):
        add_sub_operator, maybe_factor = children
        self.visited_operator()
        return Operation(add_sub_operator, rhs=maybe_factor[0])

    def visit_mul_div(self, _, children):
        mul_div_operator, primary = children
        self.visited_operator()
        return Operation(mul_div_operator, rhs=primary)

    @staticmethod
    def strip_spaces(children):
        """Visitor for a `spaces foo spaces` node"""
        _, value, _ = children

        return value

    def visit_maybe_factor(self, _, children):
        return self.strip_spaces(children)

    def visit_primary(self, _, children):
        # Return the 0th element since this is a (numeric/function/field)
        self.terms += 1
        return self.strip_spaces(children)[0]

    def visit_parens(self, _, children):
        # Strip brackets
        _, term, _ = children

        return term

    @staticmethod
    def parse_operator(operator):
        # operator is a list since the pattern is (a/b) but we'll only ever want the first value
        return operator[0].expr_name

    def visit_add_sub_operator(self, _, children):
        return self.parse_operator(self.strip_spaces(children))

    def visit_mul_div_operator(self, _, children):
        return self.parse_operator(self.strip_spaces(children))

    def visit_numeric_value(self, node, _):
        return float(node.text)

    def visit_field_value(self, node, _):
        field = node.text
        if field not in self.field_allowlist and field not in self.custom_measurements:
            raise ArithmeticValidationError(f"{field} not allowed in arithmetic")
        self.fields.add(field)
        return field

    def visit_function_value(self, node, children):
        function_node, *_ = children
        function_name = function_node.text
        field = node.text
        if function_name not in self.function_allowlist:
            raise ArithmeticValidationError(f"{function_name} not allowed in arithmetic")
        self.functions.add(field)
        return field

    def generic_visit(self, node, children):
        return children or node


def parse_arithmetic(
    equation: str,
    max_operators: int | None = None,
    custom_measurements: set[str] | None = None,
    validate_single_operator: bool = False,
) -> tuple[Operation, list[str], list[str]]:
    """Given a string equation try to parse it into a set of Operations"""
    try:
        tree = arithmetic_grammar.parse(equation)
    except ParseError:
        raise ArithmeticParseError(
            "Unable to parse your equation, make sure it is well formed arithmetic"
        )
    visitor = ArithmeticVisitor(max_operators, custom_measurements)
    result = visitor.visit(tree)
    # total count is the exception to the no mixing rule
    if (
        visitor.fields.intersection({TOTAL_COUNT_ALIAS, TOTAL_TRANSACTION_DURATION_ALIAS})
        and len(visitor.functions) > 0
    ):
        return result, list(visitor.fields), list(visitor.functions)
    if len(visitor.fields) > 0 and len(visitor.functions) > 0:
        raise ArithmeticValidationError("Cannot mix functions and fields in arithmetic")
    if validate_single_operator and visitor.operators == 0:
        raise ArithmeticValidationError("Arithmetic expression must contain at least 1 operator")
    return result, list(visitor.fields), list(visitor.functions)


def resolve_equation_list(
    equations: list[str],
    selected_columns: list[str],
    aggregates_only: bool = False,
    auto_add: bool = False,
    plain_math: bool = False,
    custom_measurements: set[str] | None = None,
) -> tuple[list[str], list[ParsedEquation]]:
    """Given a list of equation strings, resolve them to their equivalent snuba json query formats
    :param equations: list of equations strings that haven't been parsed yet
    :param selected_columns: list of public aliases from the endpoint, can be a mix of fields and aggregates
    :param aggregates_only: Optional parameter whether we need to enforce equations don't include fields
        intended for use with event-stats where fields aren't compatible since they change grouping
    :param: auto_add: Optional parameter that will take any fields in the equation that's missing in the
        selected_columns and return a new list with them added
    :param plain_math: Allow equations that don't include any fields or functions, disabled by default
    """
    parsed_equations: list[ParsedEquation] = []
    resolved_columns: list[str] = selected_columns[:]
    for index, equation in enumerate(equations):
        parsed_equation, fields, functions = parse_arithmetic(
            equation, None, custom_measurements, validate_single_operator=True
        )

        if (len(fields) == 0 and len(functions) == 0) and not plain_math:
            raise InvalidSearchQuery("Equations need to include a field or function")
        if aggregates_only and len(functions) == 0:
            raise InvalidSearchQuery("Only equations on aggregate functions are supported")

        for field in fields:
            if field not in selected_columns:
                if auto_add:
                    resolved_columns.append(field)
                else:
                    raise InvalidSearchQuery(
                        f"{field} used in an equation but is not a selected field"
                    )
        for function in functions:
            if function not in selected_columns:
                if auto_add:
                    resolved_columns.append(function)
                else:
                    raise InvalidSearchQuery(
                        f"{function} used in an equation but is not a selected function"
                    )

        # TODO: currently returning "resolved_equations" for the json syntax
        # once we're converted to SnQL this should only return parsed_equations
        parsed_equations.append(ParsedEquation(parsed_equation, len(functions) > 0))
    return resolved_columns, parsed_equations


def is_equation(field: str) -> bool:
    """check if a public alias is an equation, which start with the equation prefix
    eg. `equation|5 + 5`
    """
    return field.startswith(EQUATION_PREFIX)


def strip_equation(field: str) -> str:
    """remove the equation prefix from a public field alias"""
    assert is_equation(field), f"{field} does not start with {EQUATION_PREFIX}"
    return field[len(EQUATION_PREFIX) :]


def categorize_columns(columns) -> tuple[list[str], list[str]]:
    """equations have a prefix so that they can be easily included alongside our existing fields"""
    equations = []
    fields = []
    for column in columns:
        if is_equation(column):
            equations.append(strip_equation(column))
        else:
            fields.append(column)
    return equations, fields


def is_equation_alias(alias: str) -> bool:
    return EQUATION_ALIAS_REGEX.match(alias) is not None
