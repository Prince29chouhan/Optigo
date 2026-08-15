"""Shared request/response helpers for the HTTP layer."""
import csv
import io
import datetime

from flask import jsonify, request


class ValidationError(ValueError):
    """Invalid client input — rendered as HTTP 400 with a readable message."""

    def __init__(self, message, field=None):
        super().__init__(message)
        self.message = message
        self.field = field


def json_body(required=True):
    """Parse a JSON body without ever raising a 500 on malformed input."""
    data = request.get_json(silent=True)
    if data is None:
        if required:
            raise ValidationError('Request body must be valid JSON')
        return {}
    if not isinstance(data, dict):
        raise ValidationError('Request body must be a JSON object')
    return data


def ok(payload=None, status=200, **extra):
    body = payload if isinstance(payload, (dict, list)) else {}
    if isinstance(body, dict):
        body = {**body, **extra}
    return jsonify(body), status


def error(message, status=400, **extra):
    return jsonify({'error': message, 'message': message, **extra}), status


def require(data, *fields):
    missing = [f for f in fields if data.get(f) in (None, '', [])]
    if missing:
        raise ValidationError(f"Missing required field(s): {', '.join(missing)}")


def as_float(value, field=None, default=None, minimum=None, maximum=None, required=False):
    if value in (None, ''):
        if required:
            raise ValidationError(f'{field or "value"} is required', field)
        return default
    try:
        number = float(value)
    except (TypeError, ValueError):
        raise ValidationError(f'{field or "value"} must be a number', field)
    if minimum is not None and number < minimum:
        raise ValidationError(f'{field or "value"} must be at least {minimum}', field)
    if maximum is not None and number > maximum:
        raise ValidationError(f'{field or "value"} must be at most {maximum}', field)
    return number


def as_int(value, field=None, default=None, minimum=None, maximum=None, required=False):
    number = as_float(value, field, default, minimum, maximum, required)
    return int(number) if number is not None else None


def as_bool(value, default=False):
    if value is None:
        return default
    if isinstance(value, bool):
        return value
    return str(value).strip().lower() in ('1', 'true', 'yes', 'on')


def parse_date(value, field='date'):
    """Accept 'YYYY-MM-DD' or a full ISO timestamp."""
    if not value:
        return None
    text = str(value).replace('Z', '')
    for fmt in ('%Y-%m-%d', '%Y-%m-%dT%H:%M:%S', '%Y-%m-%dT%H:%M'):
        try:
            return datetime.datetime.strptime(text, fmt)
        except ValueError:
            continue
    raise ValidationError(f'{field} must be an ISO date like 2026-01-31', field)


def pagination():
    limit = as_int(request.args.get('limit'), 'limit', default=100, minimum=1, maximum=1000)
    skip = as_int(request.args.get('offset') or request.args.get('skip'), 'offset', default=0, minimum=0)
    return limit, skip


def csv_response(filename, header, rows):
    """Build a downloadable CSV response from a header + row iterable."""
    buffer = io.StringIO()
    writer = csv.writer(buffer)
    writer.writerow(header)
    for row in rows:
        writer.writerow(row)
    from flask import Response  # local import keeps module import cheap
    return Response(
        buffer.getvalue(),
        mimetype='text/csv',
        headers={'Content-Disposition': f'attachment; filename="{filename}"'},
    )
