import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import {
  TbDownload, TbEdit, TbPackage, TbPlus, TbRoute, TbTrash, TbTruckDelivery,
} from "react-icons/tb";
import PageShell from "../components/PageShell";
import PackageLines, { serializePackages, summarisePackages } from "../components/PackageLines";
import {
  Button, Card, Chip, Field, Modal, NumberInput, Select, Spinner, Table, TextInput,
} from "../components/ui";
import {
  createOrder, deleteOrder, exportOrdersCsv, getLocations, getOrders, setOrderStatus, updateOrder,
} from "../lib/api";
import { formatDate, formatWeight } from "../lib/format";
import { useSettings } from "../context/SettingsContext";

const STATUS_TONES = {
  new: "slate", planned: "blue", dispatched: "violet",
  in_transit: "amber", delivered: "emerald", cancelled: "rose", failed: "rose",
};

const emptyStop = () => ({
  locationId: "", name: "", lat: "", lon: "", address: "",
  window_start: "", window_end: "", service_minutes: 15, contact_name: "", instructions: "",
});

const emptyOrder = () => ({
  reference: "", customer_name: "", customer_phone: "", priority: 3, status: "new",
  usePickup: true, pickup: emptyStop(), dropoff: emptyStop(), packages: [], notes: "",
});

const toFormStop = (block) =>
  block
    ? {
        locationId: block.location_id || "",
        name: block.name || "",
        lat: block.lat ?? "",
        lon: block.lon ?? "",
        address: block.address || "",
        window_start: block.window_start || "",
        window_end: block.window_end || "",
        service_minutes: block.service_minutes ?? 15,
        contact_name: block.contact_name || "",
        instructions: block.instructions || "",
      }
    : emptyStop();

const toApiStop = (stop) => {
  const payload = {
    name: stop.name || undefined,
    address: stop.address || undefined,
    window_start: stop.window_start || undefined,
    window_end: stop.window_end || undefined,
    service_minutes: Number(stop.service_minutes) || 0,
    contact_name: stop.contact_name || undefined,
    instructions: stop.instructions || undefined,
  };
  if (stop.locationId) payload.location_id = stop.locationId;
  else {
    payload.lat = Number(stop.lat);
    payload.lon = Number(stop.lon);
  }
  return payload;
};

export default function Orders() {
  const navigate = useNavigate();
  const { units } = useSettings();
  const [orders, setOrders] = useState([]);
  const [locations, setLocations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("");
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [orderData, locationData] = await Promise.all([
        getOrders({ status: statusFilter || undefined, limit: 300 }),
        getLocations(),
      ]);
      setOrders(orderData.orders || []);
      setLocations(locationData.locations || []);
    } catch (error) {
      toast.error(error.message || "Could not load orders");
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return orders;
    return orders.filter((order) =>
      [order.reference, order.customer_name, order.dropoff?.name, order.pickup?.name]
        .filter(Boolean)
        .some((value) => value.toLowerCase().includes(term))
    );
  }, [orders, search]);

  const totals = useMemo(() => {
    const weight = orders.reduce((sum, order) => sum + (order.totals?.total_weight_kg || 0), 0);
    return {
      count: orders.length,
      weight,
      unplanned: orders.filter((order) => !order.route_id && order.status === "new").length,
    };
  }, [orders]);

  const handleSave = async () => {
    if (!editing.dropoff.locationId && (editing.dropoff.lat === "" || editing.dropoff.lon === "")) {
      toast.error("The drop-off needs a saved location or coordinates.");
      return;
    }
    setSaving(true);
    try {
      const payload = {
        reference: editing.reference || undefined,
        customer_name: editing.customer_name,
        customer_phone: editing.customer_phone,
        priority: Number(editing.priority) || 3,
        status: editing.status,
        notes: editing.notes,
        pickup: editing.usePickup ? toApiStop(editing.pickup) : null,
        dropoff: toApiStop(editing.dropoff),
        packages: serializePackages(editing.packages),
      };
      if (editing.id) {
        await updateOrder(editing.id, payload);
        toast.success("Order updated");
      } else {
        await createOrder(payload);
        toast.success("Order created");
      }
      setEditing(null);
      await load();
    } catch (error) {
      toast.error(error.message || "Could not save the order");
    } finally {
      setSaving(false);
    }
  };

  const handleStatus = async (order, status) => {
    try {
      await setOrderStatus(order.id, status);
      await load();
    } catch (error) {
      toast.error(error.message || "Could not update the status");
    }
  };

  const handleDelete = async (order) => {
    if (!window.confirm(`Delete order ${order.reference}?`)) return;
    try {
      await deleteOrder(order.id);
      toast.success("Order deleted");
      await load();
    } catch (error) {
      if (error.status === 409 && window.confirm(`${error.message}\n\nDelete anyway?`)) {
        await deleteOrder(order.id, true);
        await load();
        return;
      }
      toast.error(error.message || "Could not delete the order");
    }
  };

  const stats = [
    { icon: <TbPackage className="text-emerald-600" size={18} />, label: "Orders", value: totals.count },
    { icon: <TbTruckDelivery className="text-blue-500" size={18} />, label: "Unplanned", value: totals.unplanned },
    { icon: <TbPackage className="text-amber-500" size={18} />, label: "Total weight", value: formatWeight(totals.weight) },
  ];

  return (
    <PageShell
      title="Orders"
      subtitle="Consignments with full package detail, ready to be planned onto vehicles"
      stats={stats}
      actions={
        <>
          <Button variant="secondary" icon={<TbDownload size={16} />} onClick={() => exportOrdersCsv()}>
            Export CSV
          </Button>
          <Button variant="secondary" icon={<TbRoute size={16} />} onClick={() => navigate("/plan")}>
            Plan orders
          </Button>
          <Button icon={<TbPlus size={16} />} onClick={() => setEditing(emptyOrder())}>New order</Button>
        </>
      }
    >
      <Card
        className="mb-6"
        actions={
          <div className="flex gap-2">
            <TextInput value={search} placeholder="Search reference or customer" onChange={setSearch} />
            <Select value={statusFilter} onChange={setStatusFilter}>
              <option value="">All statuses</option>
              {Object.keys(STATUS_TONES).map((status) => (
                <option key={status} value={status}>{status.replace("_", " ")}</option>
              ))}
            </Select>
          </div>
        }
        title={`${filtered.length} order${filtered.length === 1 ? "" : "s"}`}
      >
        {loading ? (
          <Spinner label="Loading orders…" />
        ) : (
          <Table
            columns={["Reference", "Customer", "Pickup → Drop-off", "Packages", "Load", "Status", "Created", "Actions"]}
            rows={filtered}
            empty="No orders yet — create one, or POST to /api/v1/orders from your own system."
            renderRow={(order) => (
              <tr key={order.id} className="border-t border-gray-100 hover:bg-emerald-50/40 align-top">
                <td className="p-3">
                  <div className="font-medium text-gray-800">{order.reference}</div>
                  <div className="text-[11px] text-gray-500">Priority {order.priority}</div>
                </td>
                <td className="p-3 text-gray-700">{order.customer_name || "—"}</td>
                <td className="p-3 text-gray-600 text-xs">
                  <div>{order.pickup?.name || "Loaded at depot"}</div>
                  <div className="text-emerald-700">→ {order.dropoff?.name}</div>
                </td>
                <td className="p-3 text-gray-600 text-xs">
                  {order.totals?.package_count || 0} item(s)
                  {order.totals?.pallets ? ` · ${order.totals.pallets} plt` : ""}
                  {order.totals?.temperature_controlled && <Chip tone="blue" className="ml-1">chilled</Chip>}
                  {order.totals?.fragile && <Chip tone="amber" className="ml-1">fragile</Chip>}
                </td>
                <td className="p-3 text-gray-700 whitespace-nowrap">
                  {formatWeight(order.totals?.total_weight_kg)}
                  <div className="text-[11px] text-gray-500">{order.totals?.total_volume_m3 || 0} m³</div>
                </td>
                <td className="p-3">
                  <Select
                    value={order.status}
                    onChange={(status) => handleStatus(order, status)}
                    className="!py-1 !text-xs"
                  >
                    {Object.keys(STATUS_TONES).map((status) => (
                      <option key={status} value={status}>{status.replace("_", " ")}</option>
                    ))}
                  </Select>
                </td>
                <td className="p-3 text-xs text-gray-500 whitespace-nowrap">
                  {formatDate(order.created_at, units.dateFormat)}
                </td>
                <td className="p-3">
                  <div className="flex gap-1">
                    <button
                      className="p-1.5 rounded-lg text-gray-500 hover:bg-emerald-100 hover:text-emerald-700"
                      title="Edit"
                      onClick={() =>
                        setEditing({
                          ...emptyOrder(),
                          ...order,
                          usePickup: Boolean(order.pickup),
                          pickup: toFormStop(order.pickup),
                          dropoff: toFormStop(order.dropoff),
                          packages: order.packages || [],
                        })
                      }
                    >
                      <TbEdit size={16} />
                    </button>
                    <button className="p-1.5 rounded-lg text-gray-500 hover:bg-rose-100 hover:text-rose-700"
                      title="Delete" onClick={() => handleDelete(order)}>
                      <TbTrash size={16} />
                    </button>
                  </div>
                </td>
              </tr>
            )}
          />
        )}
      </Card>

      <Modal
        open={Boolean(editing)}
        title={editing?.id ? `Edit ${editing.reference}` : "New order"}
        onClose={() => setEditing(null)}
        width="max-w-4xl"
        footer={
          <>
            <Button variant="outline" onClick={() => setEditing(null)}>Cancel</Button>
            <Button onClick={handleSave} loading={saving}>Save order</Button>
          </>
        }
      >
        {editing && (
          <div className="space-y-5">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <Field label="Reference" hint="Auto-generated when blank">
                <TextInput value={editing.reference} onChange={(value) => setEditing({ ...editing, reference: value })} />
              </Field>
              <Field label="Customer">
                <TextInput value={editing.customer_name}
                  onChange={(value) => setEditing({ ...editing, customer_name: value })} />
              </Field>
              <Field label="Phone">
                <TextInput value={editing.customer_phone}
                  onChange={(value) => setEditing({ ...editing, customer_phone: value })} />
              </Field>
              <Field label="Priority" hint="1 = plan first">
                <NumberInput min={1} max={5} value={editing.priority}
                  onChange={(value) => setEditing({ ...editing, priority: value })} />
              </Field>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <StopFields
                title="Pickup"
                enabled={editing.usePickup}
                onToggle={(value) => setEditing({ ...editing, usePickup: value })}
                toggleLabel="Collect from a pickup point (off = already loaded at the depot)"
                stop={editing.pickup}
                locations={locations}
                onChange={(patch) => setEditing({ ...editing, pickup: { ...editing.pickup, ...patch } })}
              />
              <StopFields
                title="Drop-off"
                stop={editing.dropoff}
                locations={locations}
                onChange={(patch) => setEditing({ ...editing, dropoff: { ...editing.dropoff, ...patch } })}
              />
            </div>

            <section>
              <h4 className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">Packages</h4>
              <PackageLines
                packages={editing.packages}
                onChange={(packages) => setEditing({ ...editing, packages })}
              />
              {editing.packages.length > 0 && (
                <p className="text-[11px] text-gray-500 mt-2">
                  Totals: {summarisePackages(editing.packages).weight.toFixed(1)} kg ·{" "}
                  {summarisePackages(editing.packages).volume.toFixed(2)} m³ — used for vehicle capacity checks.
                </p>
              )}
            </section>

            <Field label="Notes">
              <TextInput value={editing.notes} onChange={(value) => setEditing({ ...editing, notes: value })} />
            </Field>
          </div>
        )}
      </Modal>
    </PageShell>
  );
}

function StopFields({ title, stop, locations, onChange, enabled = true, onToggle, toggleLabel }) {
  return (
    <div className={`rounded-xl border p-4 space-y-3 ${enabled ? "border-emerald-200 bg-emerald-50/40" : "border-gray-200 bg-gray-50"}`}>
      <div className="flex items-center justify-between">
        <h4 className="font-semibold text-emerald-900 text-sm">{title}</h4>
        {onToggle && (
          <label className="flex items-center gap-1.5 text-[11px] text-gray-600 cursor-pointer">
            <input type="checkbox" className="accent-emerald-600" checked={enabled}
              onChange={(event) => onToggle(event.target.checked)} />
            enabled
          </label>
        )}
      </div>
      {toggleLabel && <p className="text-[11px] text-gray-500 -mt-2">{toggleLabel}</p>}

      {enabled && (
        <>
          <Field label="Saved location">
            <Select value={stop.locationId} onChange={(value) => onChange({ locationId: value })}>
              <option value="">— custom address —</option>
              {locations.map((location) => (
                <option key={location.id} value={location.id}>
                  {location.name}{location.source === "dataset" ? " (network)" : ""}
                </option>
              ))}
            </Select>
          </Field>

          {!stop.locationId && (
            <div className="grid grid-cols-3 gap-2">
              <Field label="Name"><TextInput value={stop.name} onChange={(value) => onChange({ name: value })} /></Field>
              <Field label="Latitude"><NumberInput step="0.0001" value={stop.lat}
                onChange={(value) => onChange({ lat: value })} /></Field>
              <Field label="Longitude"><NumberInput step="0.0001" value={stop.lon}
                onChange={(value) => onChange({ lon: value })} /></Field>
            </div>
          )}

          <div className="grid grid-cols-3 gap-2">
            <Field label="From"><TextInput type="time" value={stop.window_start}
              onChange={(value) => onChange({ window_start: value })} /></Field>
            <Field label="Until"><TextInput type="time" value={stop.window_end}
              onChange={(value) => onChange({ window_end: value })} /></Field>
            <Field label="Service (min)"><NumberInput min={0} value={stop.service_minutes}
              onChange={(value) => onChange({ service_minutes: value })} /></Field>
          </div>

          <Field label="Instructions">
            <TextInput value={stop.instructions} placeholder="Gate code, dock number…"
              onChange={(value) => onChange({ instructions: value })} />
          </Field>
        </>
      )}
    </div>
  );
}
