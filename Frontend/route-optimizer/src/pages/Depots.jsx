import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import {
  TbBuildingWarehouse, TbCloudDownload, TbEdit, TbMapPin, TbPlus, TbSearch, TbTrash,
} from "react-icons/tb";
import PageShell from "../components/PageShell";
import {
  Button, Card, Chip, Field, Modal, NumberInput, Select, Spinner, Table, TextInput,
} from "../components/ui";
import { addDepot, deleteDepot, getLocations, importDatasetDepots, updateDepot } from "../lib/api";
import { useAuth } from "../context/AuthContext";

const LOCATION_TYPES = ["depot", "warehouse", "customer", "supplier", "fuel", "rest", "custom"];

const emptyDepot = {
  name: "", type: "depot", city: "", address: "", postcode: "",
  lat: "", lon: "", capacity: "", service_minutes: 15,
  contact_name: "", contact_phone: "", opening_time: "", closing_time: "", notes: "",
};

export default function Depots() {
  const navigate = useNavigate();
  const { canManage } = useAuth();
  const [locations, setLocations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [showDataset, setShowDataset] = useState(false);
  const [editing, setEditing] = useState(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getLocations({ include_dataset: 1 });
      setLocations(data.locations || []);
    } catch (error) {
      toast.error(error.message || "Could not load depots");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const companyLocations = useMemo(() => locations.filter((l) => l.source === "company"), [locations]);
  const datasetLocations = useMemo(() => locations.filter((l) => l.source === "dataset"), [locations]);

  const visible = useMemo(() => {
    const pool = showDataset ? locations : companyLocations;
    const term = search.trim().toLowerCase();
    if (!term) return pool;
    return pool.filter((location) =>
      [location.name, location.city, location.address, location.postcode]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(term))
    );
  }, [locations, companyLocations, showDataset, search]);

  const handleSave = async () => {
    if (!editing.name?.trim()) {
      toast.error("A depot name is required.");
      return;
    }
    if (editing.lat === "" || editing.lon === "") {
      toast.error("Latitude and longitude are required — the planner needs coordinates.");
      return;
    }
    setSaving(true);
    try {
      const payload = {
        ...editing,
        lat: Number(editing.lat),
        lon: Number(editing.lon),
        capacity: Number(editing.capacity) || 0,
        service_minutes: Number(editing.service_minutes) || 0,
      };
      delete payload.id;
      delete payload._id;
      delete payload.source;
      delete payload.in_gnn_network;

      if (editing.id) {
        await updateDepot(editing.id, payload);
        toast.success("Depot updated");
      } else {
        await addDepot(payload);
        toast.success("Depot added — it is now selectable in the route planner");
      }
      setEditing(null);
      await load();
    } catch (error) {
      toast.error(error.message || "Could not save the depot");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (depot) => {
    if (!window.confirm(`Delete ${depot.name}?`)) return;
    try {
      await deleteDepot(depot.id);
      toast.success("Depot deleted");
      await load();
    } catch (error) {
      toast.error(error.message || "Could not delete the depot");
    }
  };

  const handleImport = async () => {
    if (!window.confirm(`Copy all ${datasetLocations.length} trained-network locations into your own list?`)) return;
    try {
      const response = await importDatasetDepots();
      toast.success(response.message);
      await load();
    } catch (error) {
      toast.error(error.message || "Could not import depots");
    }
  };

  const stats = [
    { icon: <TbBuildingWarehouse className="text-emerald-600" size={18} />, label: "My depots", value: companyLocations.length },
    { icon: <TbMapPin className="text-blue-500" size={18} />, label: "Network locations", value: datasetLocations.length },
    {
      icon: <TbBuildingWarehouse className="text-amber-500" size={18} />, label: "Cities",
      value: new Set(companyLocations.map((l) => l.city).filter(Boolean)).size,
    },
  ];

  return (
    <PageShell
      title="Depots & locations"
      subtitle="Every location here is immediately available when planning a route"
      stats={stats}
      actions={
        canManage && (
          <>
            <Button variant="secondary" icon={<TbCloudDownload size={16} />} onClick={handleImport}>
              Import network locations
            </Button>
            <Button icon={<TbPlus size={16} />} onClick={() => setEditing({ ...emptyDepot })}>Add depot</Button>
          </>
        )
      }
    >
      <Card
        title={`${visible.length} location${visible.length === 1 ? "" : "s"}`}
        subtitle={showDataset
          ? "Showing your depots and the locations the cost models were trained on"
          : "Showing your company's depots"}
        actions={
          <div className="flex items-center gap-2">
            <div className="relative">
              <TbSearch className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search name, city, postcode"
                className="pl-8 pr-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
              />
            </div>
            <label className="flex items-center gap-1.5 text-xs text-gray-600 cursor-pointer whitespace-nowrap">
              <input type="checkbox" className="accent-emerald-600" checked={showDataset}
                onChange={(event) => setShowDataset(event.target.checked)} />
              show network depots
            </label>
          </div>
        }
      >
        {loading ? (
          <Spinner label="Loading depots…" />
        ) : (
          <Table
            columns={["Name", "Type", "City", "Coordinates", "Capacity", "Service", "Source", canManage ? "Actions" : ""].filter(Boolean)}
            rows={visible}
            empty="No locations yet — add your first depot to start planning."
            renderRow={(location) => (
              <tr key={`${location.source}-${location.id}`} className="border-t border-gray-100 hover:bg-emerald-50/40">
                <td className="p-3">
                  <div className="font-medium text-gray-800">{location.name}</div>
                  {location.address && <div className="text-[11px] text-gray-500">{location.address}</div>}
                </td>
                <td className="p-3"><Chip tone="slate">{location.type || "depot"}</Chip></td>
                <td className="p-3 text-gray-600">{location.city || "—"}</td>
                <td className="p-3 text-xs text-gray-600 whitespace-nowrap">
                  {Number(location.lat).toFixed(4)}, {Number(location.lon).toFixed(4)}
                </td>
                <td className="p-3">{location.capacity || "—"}</td>
                <td className="p-3">{location.service_minutes != null ? `${location.service_minutes} min` : "—"}</td>
                <td className="p-3">
                  {location.source === "dataset"
                    ? <Chip tone="blue">Trained network</Chip>
                    : <Chip tone="emerald">My depot</Chip>}
                </td>
                {canManage && (
                  <td className="p-3">
                    {location.source === "company" ? (
                      <div className="flex gap-1">
                        <button className="p-1.5 rounded-lg text-gray-500 hover:bg-emerald-100 hover:text-emerald-700"
                          title="Edit" onClick={() => setEditing({ ...emptyDepot, ...location })}>
                          <TbEdit size={16} />
                        </button>
                        <button className="p-1.5 rounded-lg text-gray-500 hover:bg-rose-100 hover:text-rose-700"
                          title="Delete" onClick={() => handleDelete(location)}>
                          <TbTrash size={16} />
                        </button>
                      </div>
                    ) : (
                      <span className="text-[11px] text-gray-400">read-only</span>
                    )}
                  </td>
                )}
              </tr>
            )}
          />
        )}
      </Card>

      <div className="mt-4">
        <Button variant="ghost" onClick={() => navigate("/plan")}>Go to the route planner →</Button>
      </div>

      <Modal
        open={Boolean(editing)}
        title={editing?.id ? `Edit ${editing.name}` : "Add depot or location"}
        onClose={() => setEditing(null)}
        width="max-w-2xl"
        footer={
          <>
            <Button variant="outline" onClick={() => setEditing(null)}>Cancel</Button>
            <Button onClick={handleSave} loading={saving}>Save location</Button>
          </>
        }
      >
        {editing && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Field label="Name *">
              <TextInput value={editing.name} placeholder="Leeds NDC"
                onChange={(value) => setEditing({ ...editing, name: value })} />
            </Field>
            <Field label="Type">
              <Select value={editing.type} onChange={(value) => setEditing({ ...editing, type: value })}>
                {LOCATION_TYPES.map((type) => (
                  <option key={type} value={type}>{type}</option>
                ))}
              </Select>
            </Field>
            <Field label="Latitude *" hint="e.g. 53.8008">
              <NumberInput step="0.0001" value={editing.lat}
                onChange={(value) => setEditing({ ...editing, lat: value })} />
            </Field>
            <Field label="Longitude *" hint="e.g. -1.5491">
              <NumberInput step="0.0001" value={editing.lon}
                onChange={(value) => setEditing({ ...editing, lon: value })} />
            </Field>
            <Field label="City">
              <TextInput value={editing.city} onChange={(value) => setEditing({ ...editing, city: value })} />
            </Field>
            <Field label="Postcode">
              <TextInput value={editing.postcode} onChange={(value) => setEditing({ ...editing, postcode: value })} />
            </Field>
            <Field label="Address" className="md:col-span-2">
              <TextInput value={editing.address} onChange={(value) => setEditing({ ...editing, address: value })} />
            </Field>
            <Field label="Capacity (units)">
              <NumberInput min={0} value={editing.capacity}
                onChange={(value) => setEditing({ ...editing, capacity: value })} />
            </Field>
            <Field label="Default service time (min)" hint="Used when planning stops here">
              <NumberInput min={0} max={600} value={editing.service_minutes}
                onChange={(value) => setEditing({ ...editing, service_minutes: value })} />
            </Field>
            <Field label="Opens">
              <TextInput type="time" value={editing.opening_time}
                onChange={(value) => setEditing({ ...editing, opening_time: value })} />
            </Field>
            <Field label="Closes">
              <TextInput type="time" value={editing.closing_time}
                onChange={(value) => setEditing({ ...editing, closing_time: value })} />
            </Field>
            <Field label="Contact name">
              <TextInput value={editing.contact_name}
                onChange={(value) => setEditing({ ...editing, contact_name: value })} />
            </Field>
            <Field label="Contact phone">
              <TextInput value={editing.contact_phone}
                onChange={(value) => setEditing({ ...editing, contact_phone: value })} />
            </Field>
            <Field label="Notes" className="md:col-span-2">
              <TextInput value={editing.notes} onChange={(value) => setEditing({ ...editing, notes: value })} />
            </Field>
          </div>
        )}
      </Modal>
    </PageShell>
  );
}
