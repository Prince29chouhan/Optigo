import { useCallback, useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import {
  TbBolt, TbEdit, TbPlus, TbSnowflake, TbTrash, TbTruck, TbWeight,
} from "react-icons/tb";
import PageShell from "../components/PageShell";
import {
  Button, Card, Chip, Field, Modal, NumberInput, Select, Spinner, Table, TextInput, Toggle,
} from "../components/ui";
import {
  createVehicle, deleteVehicle, getLocations, getVehicleTypes, getVehicles, updateVehicle,
} from "../lib/api";
import { useAuth } from "../context/AuthContext";
import { formatWeight } from "../lib/format";

const emptyVehicle = {
  name: "", registration: "", type: "rigid_7_5t",
  capacity_kg: "", capacity_m3: "", max_pallets: "",
  length_m: "", width_m: "", height_m: "",
  fuel_type: "diesel", fuel_efficiency_km_per_l: "", kwh_per_km: "",
  avg_speed_kmh: "", cost_per_km: "", cost_per_hour: "",
  start_location_id: "", end_location_id: "", return_to_start: true,
  driver_name: "", shift_start: "08:00", max_shift_minutes: 780,
  temperature_controlled: false, tail_lift: false, hazmat_certified: false,
  status: "active", notes: "",
};

export default function Vehicles() {
  const { canManage } = useAuth();
  const [vehicles, setVehicles] = useState([]);
  const [types, setTypes] = useState([]);
  const [locations, setLocations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [vehicleData, typeData, locationData] = await Promise.all([
        getVehicles({ include_inactive: 1 }),
        getVehicleTypes(),
        getLocations({ include_dataset: 1 }),
      ]);
      setVehicles(vehicleData.vehicles || []);
      setTypes(typeData.types || []);
      setLocations(locationData.locations || []);
    } catch (error) {
      toast.error(error.message || "Could not load the fleet");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const preset = useMemo(
    () => types.find((type) => type.value === editing?.type) || {},
    [types, editing?.type]
  );

  const handleSave = async () => {
    setSaving(true);
    try {
      const payload = Object.fromEntries(
        Object.entries(editing).filter(([, value]) => value !== "" && value !== null)
      );
      delete payload.id;
      delete payload._id;
      if (editing.id) {
        await updateVehicle(editing.id, payload);
        toast.success("Vehicle updated");
      } else {
        await createVehicle(payload);
        toast.success("Vehicle added");
      }
      setEditing(null);
      await load();
    } catch (error) {
      toast.error(error.message || "Could not save the vehicle");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (vehicle) => {
    if (!window.confirm(`Delete ${vehicle.name}?`)) return;
    try {
      await deleteVehicle(vehicle.id);
      toast.success("Vehicle deleted");
      await load();
    } catch (error) {
      if (error.status === 409 && window.confirm(`${error.message}\n\nDelete anyway?`)) {
        await deleteVehicle(vehicle.id, true);
        await load();
        return;
      }
      toast.error(error.message || "Could not delete the vehicle");
    }
  };

  const totals = useMemo(() => ({
    count: vehicles.length,
    capacity: vehicles.reduce((sum, vehicle) => sum + (vehicle.capacity_kg || 0), 0),
    volume: vehicles.reduce((sum, vehicle) => sum + (vehicle.capacity_m3 || 0), 0),
    electric: vehicles.filter((vehicle) => vehicle.fuel_type === "electric").length,
  }), [vehicles]);

  const stats = [
    { icon: <TbTruck className="text-emerald-600" size={18} />, label: "Vehicles", value: totals.count },
    { icon: <TbWeight className="text-blue-500" size={18} />, label: "Fleet payload", value: formatWeight(totals.capacity) },
    { icon: <TbBolt className="text-amber-500" size={18} />, label: "Electric", value: totals.electric },
  ];

  return (
    <PageShell
      title="Fleet"
      subtitle="Capacity, dimensions, fuel and cost data used by the route optimiser"
      stats={stats}
      actions={canManage && (
        <Button icon={<TbPlus size={16} />} onClick={() => setEditing({ ...emptyVehicle })}>
          Add vehicle
        </Button>
      )}
    >
      <Card className="mb-6">
        {loading ? (
          <Spinner label="Loading fleet…" />
        ) : (
          <Table
            columns={["Vehicle", "Type", "Capacity", "Dimensions (L×W×H)", "Energy", "Cost/km", "Base", canManage ? "Actions" : ""].filter(Boolean)}
            rows={vehicles}
            empty="No vehicles yet — add one so plans use real capacity and costs."
            renderRow={(vehicle) => {
              const base = locations.find((location) => location.id === vehicle.start_location_id);
              return (
                <tr key={vehicle.id} className="border-t border-gray-100 hover:bg-emerald-50/40">
                  <td className="p-3">
                    <div className="font-medium text-gray-800 flex items-center gap-2">
                      {vehicle.name}
                      {vehicle.temperature_controlled && <TbSnowflake className="text-sky-500" size={14} title="Temperature controlled" />}
                    </div>
                    <div className="text-[11px] text-gray-500">
                      {vehicle.registration || "no reg"}{vehicle.driver_name ? ` · ${vehicle.driver_name}` : ""}
                    </div>
                  </td>
                  <td className="p-3">
                    <Chip tone="slate">{vehicle.type_label || vehicle.type}</Chip>
                  </td>
                  <td className="p-3 whitespace-nowrap">
                    {formatWeight(vehicle.capacity_kg)} · {vehicle.capacity_m3} m³
                    {vehicle.max_pallets ? ` · ${vehicle.max_pallets} plt` : ""}
                  </td>
                  <td className="p-3 whitespace-nowrap text-gray-600">
                    {[vehicle.length_m, vehicle.width_m, vehicle.height_m].every((value) => !value)
                      ? "—"
                      : `${vehicle.length_m || "?"} × ${vehicle.width_m || "?"} × ${vehicle.height_m || "?"} m`}
                  </td>
                  <td className="p-3 whitespace-nowrap text-gray-600">
                    {vehicle.fuel_type === "electric"
                      ? `${vehicle.kwh_per_km} kWh/km`
                      : `${vehicle.fuel_efficiency_km_per_l} km/L`}
                  </td>
                  <td className="p-3">£{Number(vehicle.cost_per_km || 0).toFixed(2)}</td>
                  <td className="p-3 text-gray-600">{base?.name || "—"}</td>
                  {canManage && (
                    <td className="p-3">
                      <div className="flex gap-1">
                        <button className="p-1.5 rounded-lg text-gray-500 hover:bg-emerald-100 hover:text-emerald-700"
                          onClick={() => setEditing({ ...emptyVehicle, ...vehicle })} title="Edit">
                          <TbEdit size={16} />
                        </button>
                        <button className="p-1.5 rounded-lg text-gray-500 hover:bg-rose-100 hover:text-rose-700"
                          onClick={() => handleDelete(vehicle)} title="Delete">
                          <TbTrash size={16} />
                        </button>
                      </div>
                    </td>
                  )}
                </tr>
              );
            }}
          />
        )}
      </Card>

      <Modal
        open={Boolean(editing)}
        title={editing?.id ? `Edit ${editing.name}` : "Add vehicle"}
        onClose={() => setEditing(null)}
        width="max-w-3xl"
        footer={
          <>
            <Button variant="outline" onClick={() => setEditing(null)}>Cancel</Button>
            <Button onClick={handleSave} loading={saving}>Save vehicle</Button>
          </>
        }
      >
        {editing && (
          <div className="space-y-5">
            <section className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <Field label="Name *">
                <TextInput value={editing.name} placeholder="Truck 01"
                  onChange={(value) => setEditing({ ...editing, name: value })} />
              </Field>
              <Field label="Registration">
                <TextInput value={editing.registration} placeholder="YZ24 ABC"
                  onChange={(value) => setEditing({ ...editing, registration: value })} />
              </Field>
              <Field label="Type" hint={preset.label}>
                <Select value={editing.type} onChange={(value) => setEditing({ ...editing, type: value })}>
                  {types.map((type) => (
                    <option key={type.value} value={type.value}>{type.label}</option>
                  ))}
                </Select>
              </Field>
            </section>

            <section>
              <h4 className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">Capacity & size</h4>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                <Field label="Payload (kg)" hint={preset.capacity_kg ? `preset ${preset.capacity_kg}` : ""}>
                  <NumberInput min={0} value={editing.capacity_kg}
                    onChange={(value) => setEditing({ ...editing, capacity_kg: value })} />
                </Field>
                <Field label="Load volume (m³)" hint={preset.capacity_m3 ? `preset ${preset.capacity_m3}` : ""}>
                  <NumberInput min={0} step="0.1" value={editing.capacity_m3}
                    onChange={(value) => setEditing({ ...editing, capacity_m3: value })} />
                </Field>
                <Field label="Pallet spaces">
                  <NumberInput min={0} value={editing.max_pallets}
                    onChange={(value) => setEditing({ ...editing, max_pallets: value })} />
                </Field>
                <Field label="Length (m)">
                  <NumberInput min={0} step="0.1" value={editing.length_m}
                    onChange={(value) => setEditing({ ...editing, length_m: value })} />
                </Field>
                <Field label="Width (m)">
                  <NumberInput min={0} step="0.1" value={editing.width_m}
                    onChange={(value) => setEditing({ ...editing, width_m: value })} />
                </Field>
                <Field label="Height (m)">
                  <NumberInput min={0} step="0.1" value={editing.height_m}
                    onChange={(value) => setEditing({ ...editing, height_m: value })} />
                </Field>
              </div>
            </section>

            <section>
              <h4 className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">Energy & cost</h4>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <Field label="Fuel type">
                  <Select value={editing.fuel_type}
                    onChange={(value) => setEditing({ ...editing, fuel_type: value })}>
                    {["diesel", "petrol", "hybrid", "electric"].map((fuel) => (
                      <option key={fuel} value={fuel}>{fuel}</option>
                    ))}
                  </Select>
                </Field>
                {editing.fuel_type === "electric" ? (
                  <Field label="kWh per km">
                    <NumberInput min={0} step="0.01" value={editing.kwh_per_km}
                      onChange={(value) => setEditing({ ...editing, kwh_per_km: value })} />
                  </Field>
                ) : (
                  <Field label="km per litre">
                    <NumberInput min={0} step="0.1" value={editing.fuel_efficiency_km_per_l}
                      onChange={(value) => setEditing({ ...editing, fuel_efficiency_km_per_l: value })} />
                  </Field>
                )}
                <Field label="Average speed (km/h)">
                  <NumberInput min={5} max={130} value={editing.avg_speed_kmh}
                    onChange={(value) => setEditing({ ...editing, avg_speed_kmh: value })} />
                </Field>
                <Field label="Running cost £/km">
                  <NumberInput min={0} step="0.01" value={editing.cost_per_km}
                    onChange={(value) => setEditing({ ...editing, cost_per_km: value })} />
                </Field>
              </div>
            </section>

            <section>
              <h4 className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">Operating base & shift</h4>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <Field label="Starts at" hint="Used to measure empty repositioning miles">
                  <Select value={editing.start_location_id || ""}
                    onChange={(value) => setEditing({ ...editing, start_location_id: value })}>
                    <option value="">— first stop —</option>
                    {locations.map((location) => (
                      <option key={location.id} value={location.id}>
                        {location.name}{location.source === "dataset" ? " (network)" : ""}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Finishes at">
                  <Select value={editing.end_location_id || ""}
                    onChange={(value) => setEditing({ ...editing, end_location_id: value })}>
                    <option value="">— same as start —</option>
                    {locations.map((location) => (
                      <option key={location.id} value={location.id}>{location.name}</option>
                    ))}
                  </Select>
                </Field>
                <Field label="Shift starts">
                  <TextInput type="time" value={editing.shift_start}
                    onChange={(value) => setEditing({ ...editing, shift_start: value })} />
                </Field>
                <Field label="Max shift (min)">
                  <NumberInput min={60} max={1440} value={editing.max_shift_minutes}
                    onChange={(value) => setEditing({ ...editing, max_shift_minutes: value })} />
                </Field>
                <Field label="Driver name" className="md:col-span-2">
                  <TextInput value={editing.driver_name}
                    onChange={(value) => setEditing({ ...editing, driver_name: value })} />
                </Field>
                <Field label="Status">
                  <Select value={editing.status} onChange={(value) => setEditing({ ...editing, status: value })}>
                    {["active", "maintenance", "retired"].map((status) => (
                      <option key={status} value={status}>{status}</option>
                    ))}
                  </Select>
                </Field>
              </div>
            </section>

            <section className="rounded-lg bg-emerald-50/60 border border-emerald-100 px-4 py-2">
              <Toggle label="Temperature controlled" description="Required for chilled or frozen orders"
                checked={editing.temperature_controlled}
                onChange={(value) => setEditing({ ...editing, temperature_controlled: value })} />
              <Toggle label="Tail lift" checked={editing.tail_lift}
                onChange={(value) => setEditing({ ...editing, tail_lift: value })} />
              <Toggle label="Hazmat certified" checked={editing.hazmat_certified}
                onChange={(value) => setEditing({ ...editing, hazmat_certified: value })} />
              <Toggle label="Return to base at the end of the shift" checked={editing.return_to_start}
                onChange={(value) => setEditing({ ...editing, return_to_start: value })} />
            </section>
          </div>
        )}
      </Modal>
    </PageShell>
  );
}
