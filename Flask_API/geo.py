"""Geographic helpers and the distance / energy / cost model.

Deliberately dependency-free (standard library only) so the planning engine can
be unit-tested without Flask, Mongo or PyTorch installed.
"""
import math

from config import FUEL_PROFILES, Config

EARTH_RADIUS_KM = 6371.0088
KM_PER_MILE = 1.609344


def haversine_km(lat1, lon1, lat2, lon2):
    """Great-circle distance in kilometres."""
    lat1, lon1, lat2, lon2 = map(float, (lat1, lon1, lat2, lon2))
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlambda = math.radians(lon2 - lon1)
    a = math.sin(dphi / 2) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(dlambda / 2) ** 2
    return 2 * EARTH_RADIUS_KM * math.asin(math.sqrt(min(1.0, a)))


def road_distance_km(lat1, lon1, lat2, lon2, road_factor=None):
    """Approximate driving distance: great-circle inflated by a road factor."""
    factor = Config.ROAD_FACTOR if road_factor is None else road_factor
    return haversine_km(lat1, lon1, lat2, lon2) * factor


def km_to_miles(km):
    return km / KM_PER_MILE


def miles_to_km(miles):
    return miles * KM_PER_MILE


def travel_minutes(distance_km, speed_kmh=None):
    speed = speed_kmh or Config.DEFAULT_SPEED_KMH
    if speed <= 0:
        speed = Config.DEFAULT_SPEED_KMH
    return (distance_km / speed) * 60.0


def valid_coords(lat, lon):
    try:
        lat, lon = float(lat), float(lon)
    except (TypeError, ValueError):
        return False
    if math.isnan(lat) or math.isnan(lon):
        return False
    return -90.0 <= lat <= 90.0 and -180.0 <= lon <= 180.0


# --------------------------------------------------------------------------
# Energy, emissions and cost
# --------------------------------------------------------------------------

def energy_for_distance(distance_km, vehicle, load_ratio=0.0):
    """Fuel litres (or kWh for EVs) needed for a distance.

    A loaded vehicle burns more: consumption is scaled linearly up to +18% at
    full payload, which matches published HGV payload/consumption curves closely
    enough for planning-grade estimates.
    """
    fuel_type = (vehicle.get('fuel_type') or 'diesel').lower()
    load_penalty = 1.0 + 0.18 * max(0.0, min(1.0, load_ratio))

    if fuel_type == 'electric':
        kwh_per_km = float(vehicle.get('kwh_per_km') or 0.9)
        return distance_km * kwh_per_km * load_penalty

    km_per_litre = float(vehicle.get('fuel_efficiency_km_per_l') or 3.5)
    if km_per_litre <= 0:
        km_per_litre = 3.5
    return (distance_km / km_per_litre) * load_penalty


def emissions_kg(energy_units, vehicle):
    fuel_type = (vehicle.get('fuel_type') or 'diesel').lower()
    profile = FUEL_PROFILES.get(fuel_type, FUEL_PROFILES['diesel'])
    if vehicle.get('co2_g_per_km'):
        return None  # caller uses the per-km override instead
    return energy_units * profile['co2_per_unit']


def energy_cost_gbp(energy_units, vehicle):
    fuel_type = (vehicle.get('fuel_type') or 'diesel').lower()
    profile = FUEL_PROFILES.get(fuel_type, FUEL_PROFILES['diesel'])
    price = vehicle.get('fuel_price_gbp') or profile['price_per_unit']
    return energy_units * float(price)


def leg_metrics(distance_km, duration_min, vehicle, load_ratio=0.0):
    """Energy / CO2 / cost for one leg of a route."""
    energy = energy_for_distance(distance_km, vehicle, load_ratio)
    fuel_type = (vehicle.get('fuel_type') or 'diesel').lower()

    if vehicle.get('co2_g_per_km'):
        co2 = distance_km * float(vehicle['co2_g_per_km']) / 1000.0
    else:
        co2 = emissions_kg(energy, vehicle) or 0.0

    fuel_cost = energy_cost_gbp(energy, vehicle)
    running_cost = distance_km * float(vehicle.get('cost_per_km') or 0.0)
    driver_cost = (duration_min / 60.0) * float(
        vehicle.get('cost_per_hour') or Config.DRIVER_COST_PER_HOUR_GBP
    )
    return {
        'energy': round(energy, 3),
        'energy_unit': FUEL_PROFILES.get(fuel_type, FUEL_PROFILES['diesel'])['unit'],
        'co2_kg': round(co2, 3),
        'fuel_cost_gbp': round(fuel_cost, 2),
        'running_cost_gbp': round(running_cost, 2),
        'driver_cost_gbp': round(driver_cost, 2),
        'total_cost_gbp': round(fuel_cost + running_cost + driver_cost, 2),
    }


def package_volume_m3(package):
    """Volume of a package: explicit value wins, else derived from dimensions."""
    if package.get('volume_m3'):
        try:
            return float(package['volume_m3']) * max(1, int(package.get('quantity') or 1))
        except (TypeError, ValueError):
            return 0.0
    try:
        length = float(package.get('length_cm') or 0)
        width = float(package.get('width_cm') or 0)
        height = float(package.get('height_cm') or 0)
        qty = max(1, int(package.get('quantity') or 1))
    except (TypeError, ValueError):
        return 0.0
    return (length * width * height) / 1_000_000.0 * qty


def package_weight_kg(package):
    try:
        weight = float(package.get('weight_kg') or 0)
        qty = max(1, int(package.get('quantity') or 1))
    except (TypeError, ValueError):
        return 0.0
    return weight * qty


def summarize_packages(packages):
    """Aggregate weight / volume / pallet counts and handling requirements."""
    packages = packages or []
    total_weight = sum(package_weight_kg(p) for p in packages)
    total_volume = sum(package_volume_m3(p) for p in packages)
    pallets = sum(
        max(1, int(p.get('quantity') or 1))
        for p in packages
        if (p.get('package_type') or '').lower() in ('pallet', 'roll_cage')
    )
    return {
        'package_count': sum(max(1, int(p.get('quantity') or 1)) for p in packages),
        'line_count': len(packages),
        'total_weight_kg': round(total_weight, 2),
        'total_volume_m3': round(total_volume, 3),
        'pallets': pallets,
        'fragile': any(p.get('fragile') for p in packages),
        'hazardous': any(p.get('hazardous') for p in packages),
        'temperature_controlled': any(p.get('temperature_controlled') for p in packages),
        'declared_value_gbp': round(sum(float(p.get('value_gbp') or 0) for p in packages), 2),
    }
