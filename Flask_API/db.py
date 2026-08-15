"""MongoDB access layer.

The previous implementation used Flask-PyMongo with default settings, which
meant a slow or momentarily unavailable database surfaced as an unhandled
exception (HTTP 500 "server error") on endpoints such as /login. This module
creates the client lazily with explicit timeouts, retries transient network
errors once, and raises a typed error the API layer turns into a clean 503.
"""
import datetime
import logging

from bson import ObjectId
from bson.errors import InvalidId
from pymongo import ASCENDING, DESCENDING, MongoClient
from pymongo.errors import AutoReconnect, ConnectionFailure, PyMongoError, ServerSelectionTimeoutError

from config import Config

log = logging.getLogger('optigo.db')

_client = None
_db = None
_indexes_ready = False


class DatabaseUnavailable(RuntimeError):
    """Raised when MongoDB cannot be reached — surfaced to clients as 503."""


def _database_name_from_uri(uri):
    # mongodb://host:27017/dbname?params  ->  dbname
    try:
        tail = uri.split('://', 1)[1]
        path = tail.split('/', 1)[1] if '/' in tail else ''
        name = path.split('?', 1)[0].strip()
        return name or None
    except (IndexError, AttributeError):
        return None


def get_db():
    """Return the shared database handle, creating the client on first use."""
    global _client, _db
    if _db is not None:
        return _db

    uri = Config.MONGO_URI
    name = Config.MONGO_DB_NAME or _database_name_from_uri(uri) or 'logistics_db'
    try:
        _client = MongoClient(
            uri,
            serverSelectionTimeoutMS=Config.MONGO_TIMEOUT_MS,
            connectTimeoutMS=Config.MONGO_TIMEOUT_MS,
            socketTimeoutMS=Config.MONGO_TIMEOUT_MS * 3,
            retryWrites=True,
            retryReads=True,
            maxPoolSize=50,
            appname='optigo-api',
        )
        _db = _client[name]
    except (ConnectionFailure, PyMongoError) as exc:  # pragma: no cover - config error
        raise DatabaseUnavailable(str(exc)) from exc
    return _db


def with_retry(operation, attempts=2):
    """Run a database operation, retrying once on a transient network blip.

    Atlas/Railway connections are routinely recycled; a single AutoReconnect is
    expected behaviour rather than a real outage.
    """
    last_error = None
    for attempt in range(attempts):
        try:
            return operation()
        except (AutoReconnect, ServerSelectionTimeoutError, ConnectionFailure) as exc:
            last_error = exc
            log.warning('Mongo transient error (attempt %s/%s): %s', attempt + 1, attempts, exc)
        except PyMongoError as exc:
            log.exception('Mongo operation failed')
            raise DatabaseUnavailable(str(exc)) from exc
    raise DatabaseUnavailable(str(last_error))


def ping():
    """True when the database answers; never raises."""
    try:
        get_db().command('ping')
        return True
    except Exception as exc:  # noqa: BLE001 - health check must not raise
        log.warning('Mongo ping failed: %s', exc)
        return False


def ensure_indexes():
    """Create the indexes the API relies on (idempotent, best effort)."""
    global _indexes_ready
    if _indexes_ready:
        return
    try:
        db = get_db()
        db.users.create_index([('email', ASCENDING)], unique=True, name='uniq_email')
        db.users.create_index([('company_name', ASCENDING), ('user_type', ASCENDING)], name='company_role')
        db.companies.create_index([('name', ASCENDING)], unique=True, name='uniq_company')
        db.depots.create_index([('company', ASCENDING), ('name', ASCENDING)], name='company_name')
        db.vehicles.create_index([('company', ASCENDING), ('registration', ASCENDING)], name='company_reg')
        db.orders.create_index([('company', ASCENDING), ('status', ASCENDING)], name='company_status')
        db.orders.create_index([('company', ASCENDING), ('reference', ASCENDING)], name='company_reference')
        db.orders.create_index([('company', ASCENDING), ('created_at', DESCENDING)], name='company_created')
        db.routes.create_index([('company', ASCENDING), ('created_at', DESCENDING)], name='company_created')
        db.routes.create_index([('company', ASCENDING), ('status', ASCENDING)], name='company_status')
        db.api_keys.create_index([('key_hash', ASCENDING)], unique=True, name='uniq_key_hash')
        db.api_keys.create_index([('company', ASCENDING)], name='company')
        db.user_settings.create_index([('user_id', ASCENDING)], unique=True, name='uniq_user')
        _indexes_ready = True
        log.info('Mongo indexes ensured')
    except Exception as exc:  # noqa: BLE001 - never block startup on index creation
        log.warning('Could not ensure indexes: %s', exc)


# --------------------------------------------------------------------------
# Serialisation helpers
# --------------------------------------------------------------------------

def to_object_id(value):
    """Best-effort ObjectId conversion; returns None when the id is malformed."""
    if isinstance(value, ObjectId):
        return value
    try:
        return ObjectId(str(value))
    except (InvalidId, TypeError):
        return None


def serialize(doc):
    """Convert a Mongo document into JSON-safe primitives."""
    if doc is None:
        return None
    if isinstance(doc, list):
        return [serialize(d) for d in doc]
    if not isinstance(doc, dict):
        return _serialize_value(doc)
    out = {}
    for key, value in doc.items():
        if key == '_id':
            out['id'] = str(value)
            out['_id'] = str(value)
        elif key == 'password':
            continue  # never leaves the server
        else:
            out[key] = _serialize_value(value)
    return out


def _serialize_value(value):
    if isinstance(value, ObjectId):
        return str(value)
    if isinstance(value, datetime.datetime):
        return value.replace(microsecond=0).isoformat() + 'Z' if value.tzinfo is None else value.isoformat()
    if isinstance(value, datetime.date):
        return value.isoformat()
    if isinstance(value, dict):
        return {k: _serialize_value(v) for k, v in value.items()}
    if isinstance(value, (list, tuple)):
        return [_serialize_value(v) for v in value]
    return value


def utcnow():
    return datetime.datetime.utcnow().replace(microsecond=0)
