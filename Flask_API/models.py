"""Domain models: validation, normalisation and conversion to planner objects.

One place decides what a vehicle / order / location / stop looks like, so the
REST API, the public /api/v1 surface and the planner can never drift apart.
"""
import random
import string

from catalog import LocationError, resolve_location
from config import PACKAGE_TYPES, STOP_TYPES, VEHICLE_TYPE_PRESETS, Config
from db import utcnow
from geo import summarize_packages, valid_coords
from vrp import Job, Stop, Vehicle, hhmm_to_minutes
from web import ValidationError, as_bool, as_float, as_int

ORDER_STATUSES = ('new', 'planned', 'dispatched', 'in_transit', 'delivered', 'cancelled', 'failed')
ROUTE_STATUSES = ('draft', 'planned', 'dispatched', 'in_progress', 'completed', 'cancelled')
LOCATION_TYPES = ('depot', 'warehouse', 'customer', 'supplier', 'fuel', 'rest', 'custom')


def _reference(prefix):
    stamp = utcnow().strftime('%y%m%d')
    suffix = ''.join(random.choices(string.ascii_uppercase + string.digits, k=4))
    return f'{prefix}-{stamp}-{suffix}'


# --------------------------------------------------------------------------
# Locations
# --------------------------------------------------------------------------

def normalize_location(payload, company, existing=None):
    data = dict(existing or {})
    name = (payload.get('name') or data.get('name') or '').strip()
    if not name:
        raise ValidationError('Location name is required', 'name')

    lat = payload.get('lat', data.get('lat'))
    lon = payload.get('lon', data.get('lon'))
    if not valid_coords(lat, lon):
        raise ValidationError('Valid latitude and longitude are required '
                              '(latitude -90..90, longitude -180..180)', 'lat')

    location_type = (payload.get('type') or data.get('type') or 'depot').lower()
    if location_type not in LOCATION_TYPES:
        raise ValidationError(f"Location type must be one of: {', '.join(LOCATION_TYPES)}", 'type')

    data.update({
        'company': company,
        'name': name,
        'type': location_type,
        'city': (payload.get('city') or data.get('city') or '').strip(),
        'address': (payload.get('address') or data.get('address') or '').strip(),
        'postcode': (payload.get('postcode') or data.get('postcode') or '').strip().upper(),
        'lat': float(lat),
        'lon': float(lon),
        'capacity': as_int(payload.get('capacity', data.get('capacity')), 'capacity', default=0, minimum=0),
        'contact_name': (payload.get('contact_name') or data.get('contact_name') or '').strip(),
        'contact_phone': (payload.get('contact_phone') or data.get('contact_phone') or '').strip(),
        'opening_time': payload.get('opening_time', data.get('opening_time')) or '',
        'closing_time': payload.get('closing_time', data.get('closing_time')) or '',
        'service_minutes': as_int(payload.get('service_minutes', data.get('service_minutes')),
                                  'service_minutes', default=15, minimum=0, maximum=600),
        'notes': (payload.get('notes') or data.get('notes') or '').strip(),
        'archived': as_bool(payload.get('archived', data.get('archived')), False),
        'updated_at': utcnow(),
    })
    data.setdefault('created_at', utcnow())
    return data


# --------------------------------------------------------------------------
# Vehicles
# --------------------------------------------------------------------------

def normalize_vehicle(payload, company, existing=None):
    data = dict(existing or {})
    vehicle_type = (payload.get('type') or data.get('type') or 'van').lower()
    preset = VEHICLE_TYPE_PRESETS.get(vehicle_type, VEHICLE_TYPE_PRESETS['van'])

    name = (payload.get('name') or data.get('name') or '').strip()
    registration = (payload.get('registration') or data.get('registration') or '').strip().upper()
    if not name and not registration:
        raise ValidationError('A vehicle needs a name or a registration', 'name')

    def pick(field, preset_key=None, caster=as_float, **kw):
        raw = payload.get(field, data.get(field, preset.get(preset_key or field)))
        return caster(raw, field, default=preset.get(preset_key or field, 0), **kw)

    fuel_type = (payload.get('fuel_type') or data.get('fuel_type') or preset.get('fuel_type', 'diesel')).lower()

    data.update({
        'company': company,
        'name': name or registration,
        'registration': registration,
        'type': vehicle_type,
        'type_label': preset.get('label', vehicle_type),
        'capacity_kg': pick('capacity_kg', minimum=0),
        'capacity_m3': pick('capacity_m3', minimum=0),
        'max_pallets': as_int(payload.get('max_pallets', data.get('max_pallets', preset.get('max_pallets', 0))),
                              'max_pallets', default=0, minimum=0),
        'length_m': pick('length_m', minimum=0),
        'width_m': pick('width_m', minimum=0),
        'height_m': pick('height_m', minimum=0),
        'max_gross_weight_kg': as_float(payload.get('max_gross_weight_kg', data.get('max_gross_weight_kg', 0)),
                                        'max_gross_weight_kg', default=0, minimum=0),
        'fuel_type': fuel_type,
        'fuel_efficiency_km_per_l': as_float(
            payload.get('fuel_efficiency_km_per_l',
                        data.get('fuel_efficiency_km_per_l', preset.get('fuel_efficiency_km_per_l', 3.5))),
            'fuel_efficiency_km_per_l', default=preset.get('fuel_efficiency_km_per_l', 3.5), minimum=0),
        'kwh_per_km': as_float(payload.get('kwh_per_km', data.get('kwh_per_km', preset.get('kwh_per_km', 0))),
                               'kwh_per_km', default=preset.get('kwh_per_km', 0), minimum=0),
        'co2_g_per_km': as_float(payload.get('co2_g_per_km', data.get('co2_g_per_km', 0)),
                                 'co2_g_per_km', default=0, minimum=0),
        'avg_speed_kmh': as_float(payload.get('avg_speed_kmh',
                                              data.get('avg_speed_kmh', preset.get('avg_speed_kmh', 60))),
                                  'avg_speed_kmh', default=preset.get('avg_speed_kmh', 60), minimum=5, maximum=130),
        'cost_per_km': as_float(payload.get('cost_per_km', data.get('cost_per_km', preset.get('cost_per_km', 0))),
                                'cost_per_km', default=preset.get('cost_per_km', 0), minimum=0),
        'cost_per_hour': as_float(payload.get('cost_per_hour',
                                              data.get('cost_per_hour', Config.DRIVER_COST_PER_HOUR_GBP)),
                                  'cost_per_hour', default=Config.DRIVER_COST_PER_HOUR_GBP, minimum=0),
        'temperature_controlled': as_bool(
            payload.get('temperature_controlled',
                        data.get('temperature_controlled', preset.get('temperature_controlled', False)))),
        'tail_lift': as_bool(payload.get('tail_lift', data.get('tail_lift', False))),
        'hazmat_certified': as_bool(payload.get('hazmat_certified', data.get('hazmat_certified', False))),
        'start_location_id': payload.get('start_location_id', data.get('start_location_id')) or None,
        'end_location_id': payload.get('end_location_id', data.get('end_location_id')) or None,
        'return_to_start': as_bool(payload.get('return_to_start', data.get('return_to_start', True)), True),
        'driver_id': payload.get('driver_id', data.get('driver_id')) or None,
        'driver_name': (payload.get('driver_name') or data.get('driver_name') or '').strip(),
        'shift_start': payload.get('shift_start', data.get('shift_start')) or '08:00',
        'shift_end': payload.get('shift_end', data.get('shift_end')) or '18:00',
        'max_shift_minutes': as_int(payload.get('max_shift_minutes',
                                                data.get('max_shift_minutes', Config.MAX_SHIFT_MINUTES)),
                                    'max_shift_minutes', default=Config.MAX_SHIFT_MINUTES, minimum=60, maximum=1440),
        'status': (payload.get('status') or data.get('status') or 'active').lower(),
        'notes': (payload.get('notes') or data.get('notes') or '').strip(),
        'updated_at': utcnow(),
    })
    data.setdefault('created_at', utcnow())
    return data


# --------------------------------------------------------------------------
# Packages & orders
# --------------------------------------------------------------------------

def normalize_package(payload):
    if not isinstance(payload, dict):
        raise ValidationError('Each package must be an object')
    package_type = (payload.get('package_type') or 'parcel').lower()
    if package_type not in PACKAGE_TYPES:
        raise ValidationError(f"package_type must be one of: {', '.join(PACKAGE_TYPES)}", 'package_type')
    package = {
        'description': (payload.get('description') or '').strip(),
        'reference': (payload.get('reference') or '').strip(),
        'barcode': (payload.get('barcode') or '').strip(),
        'package_type': package_type,
        'quantity': as_int(payload.get('quantity'), 'quantity', default=1, minimum=1, maximum=100000),
        'weight_kg': as_float(payload.get('weight_kg'), 'weight_kg', default=0, minimum=0),
        'length_cm': as_float(payload.get('length_cm'), 'length_cm', default=0, minimum=0),
        'width_cm': as_float(payload.get('width_cm'), 'width_cm', default=0, minimum=0),
        'height_cm': as_float(payload.get('height_cm'), 'height_cm', default=0, minimum=0),
        'volume_m3': as_float(payload.get('volume_m3'), 'volume_m3', default=0, minimum=0),
        'fragile': as_bool(payload.get('fragile')),
        'stackable': as_bool(payload.get('stackable'), True),
        'hazardous': as_bool(payload.get('hazardous')),
        'hazard_class': (payload.get('hazard_class') or '').strip(),
        'temperature_controlled': as_bool(payload.get('temperature_controlled')),
        'temp_min_c': as_float(payload.get('temp_min_c'), 'temp_min_c', default=None),
        'temp_max_c': as_float(payload.get('temp_max_c'), 'temp_max_c', default=None),
        'value_gbp': as_float(payload.get('value_gbp'), 'value_gbp', default=0, minimum=0),
        'notes': (payload.get('notes') or '').strip(),
    }
    if package['weight_kg'] <= 0 and package['volume_m3'] <= 0 and not any(
            package[d] for d in ('length_cm', 'width_cm', 'height_cm')):
        # Not fatal — some customers only track piece counts — but flag it back.
        package['notes'] = (package['notes'] + ' (no weight or dimensions supplied)').strip()
    return package


def normalize_stop_ref(payload, company, label, default_service=15):
    """Validate a pickup/drop-off block on an order."""
    if not isinstance(payload, dict):
        raise ValidationError(f'{label} must be an object with a location or coordinates')
    try:
        resolved = resolve_location(company, payload, label)
    except LocationError as exc:
        raise ValidationError(str(exc), label)

    window_start = hhmm_to_minutes(payload.get('window_start'))
    window_end = hhmm_to_minutes(payload.get('window_end'))
    if window_start is not None and window_end is not None and window_end < window_start:
        raise ValidationError(f'{label} time window ends before it starts', label)

    return {
        'location_id': resolved.get('location_id'),
        'name': payload.get('name') or resolved.get('name'),
        'lat': resolved['lat'],
        'lon': resolved['lon'],
        'address': payload.get('address') or resolved.get('address', ''),
        'city': payload.get('city') or resolved.get('city', ''),
        'postcode': (payload.get('postcode') or '').strip().upper(),
        'contact_name': (payload.get('contact_name') or '').strip(),
        'contact_phone': (payload.get('contact_phone') or '').strip(),
        'window_start': payload.get('window_start') or None,
        'window_end': payload.get('window_end') or None,
        'service_minutes': as_int(payload.get('service_minutes'), 'service_minutes',
                                  default=default_service, minimum=0, maximum=600),
        'instructions': (payload.get('instructions') or '').strip(),
        'in_gnn_network': bool(resolved.get('in_gnn_network')),
    }


def normalize_order(payload, company, created_by=None, existing=None):
    data = dict(existing or {})
    packages = [normalize_package(p) for p in (payload.get('packages') or data.get('packages') or [])]
    totals = summarize_packages(packages)

    dropoff_payload = payload.get('dropoff') or payload.get('delivery') or data.get('dropoff')
    if not dropoff_payload:
        raise ValidationError('An order needs a drop-off location', 'dropoff')
    pickup_payload = payload.get('pickup', data.get('pickup'))

    status = (payload.get('status') or data.get('status') or 'new').lower()
    if status not in ORDER_STATUSES:
        raise ValidationError(f"status must be one of: {', '.join(ORDER_STATUSES)}", 'status')

    data.update({
        'company': company,
        'reference': (payload.get('reference') or data.get('reference') or _reference('ORD')).strip(),
        'status': status,
        'priority': as_int(payload.get('priority', data.get('priority', 3)), 'priority',
                           default=3, minimum=1, maximum=5),
        'customer_name': (payload.get('customer_name') or data.get('customer_name') or '').strip(),
        'customer_phone': (payload.get('customer_phone') or data.get('customer_phone') or '').strip(),
        'customer_email': (payload.get('customer_email') or data.get('customer_email') or '').strip(),
        'service_date': payload.get('service_date', data.get('service_date')) or None,
        'pickup': normalize_stop_ref(pickup_payload, company, 'pickup') if pickup_payload else None,
        'dropoff': normalize_stop_ref(dropoff_payload, company, 'dropoff'),
        'packages': packages,
        'totals': totals,
        'vehicle_id': payload.get('vehicle_id', data.get('vehicle_id')) or None,
        'notes': (payload.get('notes') or data.get('notes') or '').strip(),
        'tags': payload.get('tags', data.get('tags')) or [],
        'updated_at': utcnow(),
    })
    data.setdefault('created_at', utcnow())
    data.setdefault('created_by', created_by)
    data.setdefault('route_id', None)
    return data


# --------------------------------------------------------------------------
# Conversion to planner objects
# --------------------------------------------------------------------------

def vehicle_from_doc(doc, company, overrides=None):
    """Build a planner Vehicle, resolving its start/end depot."""
    overrides = overrides or {}
    vehicle_id = str(overrides.get('id') or doc.get('id') or doc.get('_id') or _reference('VEH'))

    start_ref = overrides.get('start') or overrides.get('start_location_id') or doc.get('start_location_id')
    if not start_ref:
        raise ValidationError(
            f"Vehicle '{doc.get('name') or vehicle_id}' has no start location — "
            f'set one on the vehicle or pass it with the plan request', 'start_location_id')
    try:
        start = resolve_location(company, start_ref, 'vehicle start location')
    except LocationError as exc:
        raise ValidationError(str(exc), 'start_location_id')

    end = None
    end_ref = overrides.get('end') or overrides.get('end_location_id') or doc.get('end_location_id')
    if end_ref:
        try:
            end = resolve_location(company, end_ref, 'vehicle end location')
        except LocationError as exc:
            raise ValidationError(str(exc), 'end_location_id')

    fuel_type = (doc.get('fuel_type') or 'diesel').lower()
    return Vehicle(
        id=vehicle_id,
        name=doc.get('name') or doc.get('registration') or f'Vehicle {vehicle_id[-4:]}',
        registration=doc.get('registration', ''),
        type=doc.get('type', 'van'),
        start=Stop(key=f'{vehicle_id}-start', type='depot_start', name=start['name'],
                   lat=start['lat'], lon=start['lon'], location_id=start.get('location_id'),
                   address=start.get('address', '')),
        end=(Stop(key=f'{vehicle_id}-end', type='depot_end', name=end['name'],
                  lat=end['lat'], lon=end['lon'], location_id=end.get('location_id'),
                  address=end.get('address', '')) if end else None),
        capacity_kg=float(doc.get('capacity_kg') or 0) or 1000.0,
        capacity_m3=float(doc.get('capacity_m3') or 0) or 10.0,
        max_pallets=int(doc.get('max_pallets') or 0),
        fuel_type=fuel_type,
        fuel_efficiency_km_per_l=float(doc.get('fuel_efficiency_km_per_l') or 3.5),
        kwh_per_km=float(doc.get('kwh_per_km') or 0),
        co2_g_per_km=float(doc.get('co2_g_per_km') or 0),
        avg_speed_kmh=float(doc.get('avg_speed_kmh') or Config.DEFAULT_SPEED_KMH),
        cost_per_km=float(doc.get('cost_per_km') or 0),
        cost_per_hour=float(doc.get('cost_per_hour') or Config.DRIVER_COST_PER_HOUR_GBP),
        shift_start_min=hhmm_to_minutes(overrides.get('shift_start') or doc.get('shift_start') or '08:00') or 480,
        max_shift_minutes=int(doc.get('max_shift_minutes') or Config.MAX_SHIFT_MINUTES),
        temperature_controlled=bool(doc.get('temperature_controlled')),
        driver_id=str(doc.get('driver_id')) if doc.get('driver_id') else None,
        driver_name=doc.get('driver_name', ''),
        return_to_start=bool(overrides.get('return_to_start', doc.get('return_to_start', True))),
    )


def job_from_order(order, sequence=0):
    """Turn a stored order into a planner Job (pickup + delivery stops).

    `sequence` positions the order's stops when the caller locks the stop order.
    """
    order_id = str(order.get('id') or order.get('_id') or order.get('reference'))
    reference = order.get('reference') or order_id
    totals = order.get('totals') or summarize_packages(order.get('packages'))
    weight = float(totals.get('total_weight_kg') or 0)
    volume = float(totals.get('total_volume_m3') or 0)
    pallets = int(totals.get('pallets') or 0)

    def build(block, stop_type):
        if not block:
            return None
        sign = 1 if stop_type == 'pickup' else -1
        return Stop(
            sequence=sequence if stop_type == 'pickup' else sequence + 1,
            key=f'{order_id}-{stop_type}',
            type=stop_type,
            name=block.get('name') or f'{reference} {stop_type}',
            lat=float(block['lat']), lon=float(block['lon']),
            service_minutes=float(block.get('service_minutes') or 15),
            order_id=order_id, order_ref=reference,
            location_id=block.get('location_id'),
            weight_kg=sign * weight, volume_m3=sign * volume, pallets=sign * pallets,
            window_start=hhmm_to_minutes(block.get('window_start')),
            window_end=hhmm_to_minutes(block.get('window_end')),
            address=block.get('address', ''),
            contact=block.get('contact_name', ''),
            notes=block.get('instructions', ''),
            packages=order.get('packages') or [],
        )

    return Job(
        order_id=order_id,
        reference=reference,
        pickup=build(order.get('pickup'), 'pickup'),
        delivery=build(order.get('dropoff'), 'delivery'),
        weight_kg=weight, volume_m3=volume, pallets=pallets,
        priority=int(order.get('priority') or 3),
        temperature_controlled=bool(totals.get('temperature_controlled')),
        hazardous=bool(totals.get('hazardous')),
        vehicle_id=str(order['vehicle_id']) if order.get('vehicle_id') else None,
    )


def stop_from_payload(payload, company, index=0):
    """Build an ad-hoc stop (pickup / delivery / rest / break / fuel / custom)."""
    stop_type = (payload.get('type') or 'custom').lower()
    if stop_type not in STOP_TYPES:
        raise ValidationError(f"Stop type must be one of: {', '.join(STOP_TYPES)}", 'type')

    try:
        resolved = resolve_location(company, payload, f'stop {index + 1}')
    except LocationError as exc:
        raise ValidationError(str(exc), 'location')

    packages = [normalize_package(p) for p in (payload.get('packages') or [])]
    totals = summarize_packages(packages)
    weight = as_float(payload.get('weight_kg'), 'weight_kg', default=totals['total_weight_kg'], minimum=0)
    volume = as_float(payload.get('volume_m3'), 'volume_m3', default=totals['total_volume_m3'], minimum=0)
    pallets = as_int(payload.get('pallets'), 'pallets', default=totals['pallets'], minimum=0)

    sign = 1 if stop_type == 'pickup' else (-1 if stop_type == 'delivery' else 0)
    default_service = {'rest': 45, 'break': 45, 'fuel': 20}.get(stop_type, 15)

    return Stop(
        key=payload.get('key') or f'stop-{index + 1}',
        type=stop_type,
        name=payload.get('name') or resolved.get('name') or f'Stop {index + 1}',
        lat=resolved['lat'], lon=resolved['lon'],
        service_minutes=as_int(payload.get('service_minutes'), 'service_minutes',
                               default=default_service, minimum=0, maximum=600),
        order_id=payload.get('order_id'),
        order_ref=payload.get('order_ref') or payload.get('reference'),
        location_id=resolved.get('location_id'),
        weight_kg=sign * weight, volume_m3=sign * volume, pallets=sign * pallets,
        window_start=hhmm_to_minutes(payload.get('window_start')),
        window_end=hhmm_to_minutes(payload.get('window_end')),
        address=payload.get('address') or resolved.get('address', ''),
        notes=(payload.get('notes') or '').strip(),
        contact=(payload.get('contact_name') or '').strip(),
        packages=packages,
        vehicle_id=str(payload['vehicle_id']) if payload.get('vehicle_id') else None,
        sequence=index,
    )


def pair_ad_hoc_stops(stops):
    """Group loose pickup/delivery stops sharing an order reference into Jobs.

    Lets the planner UI say "these two pickups and these three drops belong to
    order X" without the caller having to create a stored order first.
    """
    jobs, extras = [], []
    by_ref = {}
    for stop in stops:
        ref = stop.order_ref or stop.order_id
        if stop.type in ('pickup', 'delivery') and ref:
            by_ref.setdefault(ref, []).append(stop)
        elif stop.type in ('pickup', 'delivery'):
            # An unpaired pickup/delivery is still real work — give it its own job.
            key = f'__solo__{stop.key}'
            by_ref.setdefault(key, []).append(stop)
        else:
            extras.append(stop)

    for ref, group in by_ref.items():
        pickups = [s for s in group if s.type == 'pickup']
        deliveries = [s for s in group if s.type == 'delivery']
        label = ref.replace('__solo__', '')
        if not deliveries:
            # Pickup-only work (collections back to base).
            for pickup in pickups:
                jobs.append(Job(order_id=pickup.order_id or pickup.key, reference=label,
                                pickup=pickup, delivery=None, weight_kg=pickup.weight_kg,
                                volume_m3=pickup.volume_m3, pallets=pickup.pallets,
                                vehicle_id=pickup.vehicle_id))
            continue
        # Multi-leg orders: pair pickups with deliveries in the order given, any
        # surplus drops become depot-loaded deliveries.
        for index, delivery in enumerate(deliveries):
            pickup = pickups[index] if index < len(pickups) else None
            for stop in (pickup, delivery):
                if stop is not None:
                    stop.order_id = stop.order_id or label
                    stop.order_ref = label
            jobs.append(Job(
                order_id=delivery.order_id or f'{label}-{index}',
                reference=label,
                pickup=pickup,
                delivery=delivery,
                weight_kg=abs(delivery.weight_kg),
                volume_m3=abs(delivery.volume_m3),
                pallets=abs(delivery.pallets),
                vehicle_id=delivery.vehicle_id or (pickup.vehicle_id if pickup else None),
            ))
        for pickup in pickups[len(deliveries):]:
            jobs.append(Job(order_id=pickup.order_id or pickup.key, reference=label,
                            pickup=pickup, delivery=None, weight_kg=pickup.weight_kg,
                            volume_m3=pickup.volume_m3, pallets=pickup.pallets,
                            vehicle_id=pickup.vehicle_id))
    return jobs, extras
