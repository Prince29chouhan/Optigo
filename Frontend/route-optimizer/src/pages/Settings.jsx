import { useCallback, useEffect, useState } from "react";
import toast from "react-hot-toast";
import {
  TbAlertTriangle, TbCheck, TbCopy, TbDatabase, TbDownload, TbKey, TbMoon, TbPlus,
  TbRoute, TbSettings, TbShield, TbSun, TbTrash, TbUserCircle,
} from "react-icons/tb";
import PageShell from "../components/PageShell";
import {
  Button, Card, Chip, Field, Modal, NumberInput, Select, Spinner, TextInput, Toggle,
} from "../components/ui";
import {
  changePassword, createApiKey, deleteCompanyData, exportDataset, getApiKeys, getSettings,
  resetSettings, revokeApiKey, updateProfile,
} from "../lib/api";
import { useAuth } from "../context/AuthContext";
import { useSettings } from "../context/SettingsContext";
import { formatDateTime } from "../lib/format";

const SECTIONS = [
  { id: "profile", label: "Profile", icon: <TbUserCircle size={18} /> },
  { id: "preferences", label: "Preferences", icon: <TbSettings size={18} /> },
  { id: "planning", label: "Planning defaults", icon: <TbRoute size={18} /> },
  { id: "security", label: "Security", icon: <TbShield size={18} /> },
  { id: "api", label: "API access", icon: <TbKey size={18} /> },
  { id: "data", label: "Data & storage", icon: <TbDatabase size={18} /> },
];

export default function Settings() {
  const { user, refreshUser, canManage } = useAuth();
  const { settings, save, reload } = useSettings();
  const [section, setSection] = useState("profile");
  const [serverData, setServerData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setServerData(await getSettings());
    } catch (error) {
      toast.error(error.message || "Could not load settings");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const persist = async (patch, message = "Settings saved") => {
    setSaving(true);
    try {
      await save(patch);
      toast.success(message);
    } catch (error) {
      toast.error(error.message || "Could not save settings");
      await reload();
    } finally {
      setSaving(false);
    }
  };

  return (
    <PageShell
      title="Settings"
      subtitle={`Signed in as ${user?.email || "—"} · ${user?.companyName || ""}`}
    >
      <div className="flex flex-col md:flex-row gap-6">
        <nav className="md:w-60 shrink-0">
          <div className="flex md:flex-col gap-1 overflow-x-auto">
            {SECTIONS.map((item) => (
              <button
                key={item.id}
                onClick={() => setSection(item.id)}
                className={`flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-medium whitespace-nowrap transition-colors
                  ${section === item.id
                    ? "bg-emerald-600 text-white shadow"
                    : "text-emerald-800 hover:bg-emerald-100"}`}
              >
                {item.icon} {item.label}
              </button>
            ))}
          </div>
        </nav>

        <div className="flex-1 min-w-0 space-y-5">
          {loading ? (
            <Spinner label="Loading settings…" />
          ) : (
            <>
              {section === "profile" && (
                <ProfileSection profile={serverData?.profile} onSaved={() => { load(); refreshUser(); }} />
              )}
              {section === "preferences" && (
                <PreferencesSection settings={settings} saving={saving} onSave={persist} />
              )}
              {section === "planning" && (
                <PlanningSection settings={settings} saving={saving} onSave={persist} />
              )}
              {section === "security" && (
                <SecuritySection settings={settings} saving={saving} onSave={persist} profile={serverData?.profile} />
              )}
              {section === "api" && <ApiSection canManage={canManage} />}
              {section === "data" && (
                <DataSection usage={serverData?.usage} canManage={canManage}
                  onChanged={load} settings={settings} onSave={persist} />
              )}
            </>
          )}
        </div>
      </div>
    </PageShell>
  );
}

/* ── Profile ───────────────────────────────────────────────────────── */
function ProfileSection({ profile, onSaved }) {
  const [form, setForm] = useState({ fullName: "", email: "", phone: "" });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (profile) {
      setForm({
        fullName: profile.fullName || "",
        email: profile.email || "",
        phone: profile.phone || "",
      });
    }
  }, [profile]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const response = await updateProfile(form);
      localStorage.setItem("fullName", response.user.fullName || "");
      localStorage.setItem("email", response.user.email || "");
      toast.success("Profile updated");
      onSaved();
    } catch (error) {
      toast.error(error.message || "Could not update your profile");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card
      title="Your profile"
      subtitle="Stored on your account and used across the app"
      actions={<Button onClick={handleSave} loading={saving}>Save changes</Button>}
    >
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Field label="Full name">
          <TextInput value={form.fullName} onChange={(value) => setForm({ ...form, fullName: value })} />
        </Field>
        <Field label="Email address" hint="Used to sign in">
          <TextInput type="email" value={form.email} onChange={(value) => setForm({ ...form, email: value })} />
        </Field>
        <Field label="Phone">
          <TextInput value={form.phone} onChange={(value) => setForm({ ...form, phone: value })} />
        </Field>
        <Field label="Role"><TextInput value={profile?.role || ""} disabled /></Field>
        <Field label="Company"><TextInput value={profile?.companyName || ""} disabled /></Field>
        <Field label="Member since">
          <TextInput value={profile?.createdAt ? formatDateTime(profile.createdAt) : "—"} disabled />
        </Field>
      </div>
    </Card>
  );
}

/* ── Preferences ───────────────────────────────────────────────────── */
function PreferencesSection({ settings, saving, onSave }) {
  const preferences = settings.preferences;
  const set = (patch) => onSave({ preferences: patch }, "Preferences saved");

  return (
    <>
      <Card title="Appearance">
        <div className="flex gap-3">
          {[
            { value: "light", label: "Light", icon: <TbSun size={16} /> },
            { value: "dark", label: "Dark", icon: <TbMoon size={16} /> },
            { value: "system", label: "System", icon: <TbSettings size={16} /> },
          ].map((theme) => (
            <button
              key={theme.value}
              disabled={saving}
              onClick={() => set({ theme: theme.value })}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-lg border-2 text-sm font-medium transition-all
                ${preferences.theme === theme.value
                  ? "border-emerald-500 bg-emerald-50 text-emerald-700"
                  : "border-gray-200 text-gray-600 hover:border-emerald-300"}`}
            >
              {theme.icon} {theme.label}
            </button>
          ))}
        </div>
      </Card>

      <Card title="Units & formats" subtitle="Applied to every distance, cost and date in the app">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label="Distance unit">
            <Select value={preferences.distanceUnit} onChange={(value) => set({ distanceUnit: value })}>
              <option value="km">Kilometres</option>
              <option value="miles">Miles</option>
            </Select>
          </Field>
          <Field label="Fuel unit">
            <Select value={preferences.fuelUnit} onChange={(value) => set({ fuelUnit: value })}>
              <option value="liters">Litres</option>
              <option value="gallons">Gallons (UK)</option>
            </Select>
          </Field>
          <Field label="Currency">
            <Select value={preferences.currency} onChange={(value) => set({ currency: value })}>
              <option value="GBP">British Pound (£)</option>
              <option value="USD">US Dollar ($)</option>
              <option value="EUR">Euro (€)</option>
            </Select>
          </Field>
          <Field label="Date format">
            <Select value={preferences.dateFormat} onChange={(value) => set({ dateFormat: value })}>
              <option value="DD/MM/YYYY">DD/MM/YYYY</option>
              <option value="MM/DD/YYYY">MM/DD/YYYY</option>
              <option value="YYYY-MM-DD">YYYY-MM-DD</option>
            </Select>
          </Field>
        </div>
      </Card>
    </>
  );
}

/* ── Planning defaults ─────────────────────────────────────────────── */
function PlanningSection({ settings, saving, onSave }) {
  const planning = settings.planning;
  const set = (patch) => onSave({ planning: patch }, "Planning defaults saved");

  return (
    <>
      <Card title="Optimiser defaults" subtitle="Pre-selected every time you open the route planner">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-2">
          <Field label="Default objective">
            <Select value={planning.defaultPreference} onChange={(value) => set({ defaultPreference: value })}>
              <option value="greenest">Greenest — lowest CO₂</option>
              <option value="fastest">Fastest — shortest time</option>
              <option value="cheapest">Cheapest — lowest cost</option>
            </Select>
          </Field>
          <Field label="Default service time per stop (min)">
            <NumberInput min={0} max={600} value={planning.defaultServiceMinutes} disabled={saving}
              onChange={(value) => set({ defaultServiceMinutes: value })} />
          </Field>
        </div>
        <Toggle label="Optimise stop order by default" checked={planning.optimizeSequence}
          description="Turn off to plan stops exactly in the order you enter them"
          onChange={(value) => set({ optimizeSequence: value })} />
        <Toggle label="Return to base by default" checked={planning.returnToStart}
          description="Includes the run home in distance, cost and empty-mile figures"
          onChange={(value) => set({ returnToStart: value })} />
      </Card>

      <Card title="Driver hours" subtitle="Used to insert statutory breaks automatically">
        <Toggle label="Insert driver breaks" checked={planning.autoBreaks}
          onChange={(value) => set({ autoBreaks: value })} />
        <div className="grid grid-cols-2 gap-4 mt-2">
          <Field label="Break length (min)">
            <NumberInput min={0} max={240} value={planning.breakMinutes} disabled={saving || !planning.autoBreaks}
              onChange={(value) => set({ breakMinutes: value })} />
          </Field>
          <Field label="Max driving before a break (min)" hint="GB/EU default is 270 minutes (4.5 h)">
            <NumberInput min={60} max={720} value={planning.maxDrivingMinutesBeforeBreak}
              disabled={saving || !planning.autoBreaks}
              onChange={(value) => set({ maxDrivingMinutesBeforeBreak: value })} />
          </Field>
        </div>
      </Card>
    </>
  );
}

/* ── Security ──────────────────────────────────────────────────────── */
function SecuritySection({ settings, onSave, profile }) {
  const [form, setForm] = useState({ current: "", next: "", confirm: "" });
  const [saving, setSaving] = useState(false);

  const handleChangePassword = async () => {
    if (form.next !== form.confirm) {
      toast.error("The new passwords do not match");
      return;
    }
    setSaving(true);
    try {
      await changePassword(form.current, form.next);
      setForm({ current: "", next: "", confirm: "" });
      toast.success("Password updated");
    } catch (error) {
      toast.error(error.message || "Could not change your password");
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <Card title="Change password" subtitle="Passwords need at least 8 characters, a letter and a number">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Field label="Current password">
            <TextInput type="password" value={form.current} autoComplete="current-password"
              onChange={(value) => setForm({ ...form, current: value })} />
          </Field>
          <Field label="New password">
            <TextInput type="password" value={form.next} autoComplete="new-password"
              onChange={(value) => setForm({ ...form, next: value })} />
          </Field>
          <Field label="Confirm new password">
            <TextInput type="password" value={form.confirm} autoComplete="new-password"
              onChange={(value) => setForm({ ...form, confirm: value })} />
          </Field>
        </div>
        <div className="mt-4">
          <Button onClick={handleChangePassword} loading={saving}
            disabled={!form.current || !form.next}>
            Update password
          </Button>
        </div>
      </Card>

      <Card title="Sign-in" subtitle="Session details for this account">
        <dl className="text-sm space-y-2">
          <div className="flex justify-between border-b border-gray-100 pb-2">
            <dt className="text-gray-600">Last sign-in</dt>
            <dd className="font-medium">{profile?.lastLoginAt ? formatDateTime(profile.lastLoginAt) : "—"}</dd>
          </div>
          <div className="flex justify-between border-b border-gray-100 pb-2">
            <dt className="text-gray-600">Session length</dt>
            <dd className="font-medium">12 hours (token expiry)</dd>
          </div>
        </dl>
        <div className="mt-3">
          <Toggle
            label="Warn me about new sign-ins"
            description="Recorded on your profile. Email delivery is not connected in this deployment."
            checked={settings.security.loginNotifications}
            onChange={(value) => onSave({ security: { loginNotifications: value } }, "Preference saved")}
          />
        </div>
      </Card>
    </>
  );
}

/* ── API access ────────────────────────────────────────────────────── */
function ApiSection({ canManage }) {
  const [keys, setKeys] = useState([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [newKeyName, setNewKeyName] = useState("");
  const [issued, setIssued] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setKeys((await getApiKeys()).keys || []);
    } catch (error) {
      if (error.status !== 403) toast.error(error.message || "Could not load API keys");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { if (canManage) load(); else setLoading(false); }, [canManage, load]);

  const handleCreate = async () => {
    setCreating(true);
    try {
      const response = await createApiKey(newKeyName || "Integration key");
      setIssued(response);
      setNewKeyName("");
      await load();
    } catch (error) {
      toast.error(error.message || "Could not create the key");
    } finally {
      setCreating(false);
    }
  };

  const handleRevoke = async (key) => {
    if (!window.confirm(`Revoke "${key.name}"? Any integration using it stops working immediately.`)) return;
    try {
      await revokeApiKey(key.id);
      toast.success("Key revoked");
      await load();
    } catch (error) {
      toast.error(error.message || "Could not revoke the key");
    }
  };

  if (!canManage) {
    return (
      <Card title="API access">
        <p className="text-sm text-gray-600">Only admins and planners can manage API keys.</p>
      </Card>
    );
  }

  return (
    <>
      <Card
        title="API keys"
        subtitle="Let another system create orders and plan routes over HTTP"
        actions={
          <div className="flex gap-2">
            <TextInput value={newKeyName} placeholder="Key name" onChange={setNewKeyName} />
            <Button icon={<TbPlus size={16} />} loading={creating} onClick={handleCreate}>Create</Button>
          </div>
        }
      >
        {loading ? (
          <Spinner label="Loading keys…" />
        ) : keys.length === 0 ? (
          <p className="text-sm text-gray-500">No keys yet. Create one to integrate an ERP or WMS.</p>
        ) : (
          <ul className="divide-y divide-gray-100">
            {keys.map((key) => (
              <li key={key.id} className="flex items-center justify-between py-3">
                <div>
                  <div className="font-medium text-gray-800 flex items-center gap-2">
                    {key.name}
                    {key.revoked ? <Chip tone="rose">revoked</Chip> : <Chip tone="emerald">active</Chip>}
                    <Chip tone="slate">{key.role}</Chip>
                  </div>
                  <div className="text-[11px] text-gray-500">
                    ••••{key.last4} · created {formatDateTime(key.created_at)}
                    {key.last_used_at ? ` · last used ${formatDateTime(key.last_used_at)}` : " · never used"}
                  </div>
                </div>
                {!key.revoked && (
                  <Button size="sm" variant="outline" icon={<TbTrash size={14} />}
                    onClick={() => handleRevoke(key)}>
                    Revoke
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card title="Using the API" subtitle="Full reference at GET /api/v1">
        <pre className="text-[11px] bg-gray-900 text-gray-100 rounded-lg p-4 overflow-x-auto">
{`# Create an order
curl -X POST "$OPTIGO_URL/api/v1/orders" \\
  -H "X-API-Key: $OPTIGO_KEY" -H "Content-Type: application/json" \\
  -d '{
    "reference": "ORD-1001",
    "customer_name": "Northern Foods",
    "pickup":  {"location_id": "<depot id>", "window_start": "08:00"},
    "dropoff": {"lat": 53.4808, "lon": -2.2426, "name": "Manchester RDC"},
    "packages": [{"package_type":"pallet","quantity":4,"weight_kg":250,
                  "length_cm":120,"width_cm":100,"height_cm":150}]
  }'

# Plan routes for those orders
curl -X POST "$OPTIGO_URL/api/v1/plan" \\
  -H "X-API-Key: $OPTIGO_KEY" -H "Content-Type: application/json" \\
  -d '{"preference":"greenest","vehicle_ids":["<vehicle id>"],
       "order_ids":["<order id>"],"save":true}'`}
        </pre>
      </Card>

      <Modal
        open={Boolean(issued)}
        title="Copy your API key"
        onClose={() => setIssued(null)}
        footer={<Button onClick={() => setIssued(null)}>Done</Button>}
      >
        <p className="text-sm text-gray-600 mb-3">
          This is the only time the key is shown. Store it in your integration's secrets.
        </p>
        <div className="flex gap-2">
          <code className="flex-1 px-3 py-2 bg-gray-100 rounded-lg text-xs break-all">{issued?.key}</code>
          <Button variant="secondary" icon={<TbCopy size={14} />}
            onClick={() => {
              navigator.clipboard?.writeText(issued.key);
              toast.success("Copied");
            }}>
            Copy
          </Button>
        </div>
      </Modal>
    </>
  );
}

/* ── Data & storage ────────────────────────────────────────────────── */
function DataSection({ usage, canManage, onChanged, settings, onSave }) {
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [datasets, setDatasets] = useState(["orders", "routes"]);

  const handleExport = async (dataset) => {
    setBusy(true);
    try {
      await exportDataset(dataset);
      toast.success("Export downloaded");
    } catch (error) {
      toast.error(error.message || "Could not export");
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async () => {
    setBusy(true);
    try {
      const response = await deleteCompanyData(datasets);
      toast.success(
        `Deleted ${Object.entries(response.deleted).map(([key, count]) => `${count} ${key}`).join(", ")}`
      );
      setConfirming(false);
      onChanged();
    } catch (error) {
      toast.error(error.message || "Could not delete the data");
    } finally {
      setBusy(false);
    }
  };

  const counts = usage || {};

  return (
    <>
      <Card title="Your data" subtitle="Live record counts for your company">
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          {[
            ["Depots", counts.depots], ["Vehicles", counts.vehicles], ["Orders", counts.orders],
            ["Routes", counts.routes], ["Users", counts.users],
          ].map(([label, value]) => (
            <div key={label} className="rounded-xl border border-emerald-100 bg-emerald-50/60 p-3 text-center">
              <div className="text-xl font-bold text-emerald-900">{value ?? 0}</div>
              <div className="text-[11px] text-emerald-700 uppercase tracking-wide">{label}</div>
            </div>
          ))}
        </div>
      </Card>

      <Card title="Export" subtitle="Download your records as JSON — no data leaves the browser unencrypted">
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" loading={busy} icon={<TbDownload size={16} />}
            onClick={() => handleExport("all")}>
            Everything (.zip)
          </Button>
          {["orders", "routes", "vehicles", "depots"].map((dataset) => (
            <Button key={dataset} variant="outline" loading={busy} onClick={() => handleExport(dataset)}>
              {dataset}
            </Button>
          ))}
        </div>
      </Card>

      <Card title="Retention">
        <Field label="Keep route history for">
          <Select value={settings.data.routeRetention}
            onChange={(value) => onSave({ data: { routeRetention: value } }, "Retention preference saved")}>
            <option value="3months">3 months</option>
            <option value="6months">6 months</option>
            <option value="1year">1 year</option>
            <option value="2years">2 years</option>
            <option value="forever">Keep forever</option>
          </Select>
        </Field>
        <p className="text-[11px] text-gray-500 mt-2">
          Recorded as your preference — routes are only removed when you delete them below.
        </p>
      </Card>

      {canManage && (
        <Card title="Danger zone">
          <div className="rounded-lg border border-rose-200 bg-rose-50 p-4">
            <div className="flex items-start gap-3">
              <TbAlertTriangle className="text-rose-600 mt-0.5" size={20} />
              <div className="flex-1">
                <p className="font-medium text-rose-900">Delete company data</p>
                <p className="text-sm text-rose-700 mt-1">
                  Permanently removes the selected records for {" "}
                  <strong>every user</strong> in your company. This cannot be undone.
                </p>
                <div className="flex flex-wrap gap-3 mt-3">
                  {["orders", "routes", "vehicles", "depots"].map((dataset) => (
                    <label key={dataset} className="flex items-center gap-1.5 text-xs text-rose-800 cursor-pointer">
                      <input
                        type="checkbox"
                        className="accent-rose-600"
                        checked={datasets.includes(dataset)}
                        onChange={(event) =>
                          setDatasets((current) =>
                            event.target.checked
                              ? [...current, dataset]
                              : current.filter((item) => item !== dataset)
                          )
                        }
                      />
                      {dataset} ({counts[dataset] ?? 0})
                    </label>
                  ))}
                </div>
                <Button variant="danger" className="mt-3" icon={<TbTrash size={16} />}
                  disabled={datasets.length === 0} onClick={() => setConfirming(true)}>
                  Delete selected data
                </Button>
              </div>
            </div>
          </div>
        </Card>
      )}

      <Card title="Reset preferences">
        <Button variant="outline" onClick={async () => {
          await resetSettings();
          toast.success("Settings reset to defaults");
          window.location.reload();
        }}>
          Restore default settings
        </Button>
      </Card>

      <Modal
        open={confirming}
        title="Confirm deletion"
        onClose={() => setConfirming(false)}
        footer={
          <>
            <Button variant="outline" onClick={() => setConfirming(false)}>Cancel</Button>
            <Button variant="danger" loading={busy} onClick={handleDelete} icon={<TbCheck size={16} />}>
              Yes, delete {datasets.join(", ")}
            </Button>
          </>
        }
      >
        <p className="text-sm text-gray-700">
          This deletes <strong>{datasets.map((dataset) => `${counts[dataset] ?? 0} ${dataset}`).join(", ")}</strong>{" "}
          for {" "}
          <strong>your whole company</strong>. Export a backup first if you might need this data.
        </p>
      </Modal>
    </>
  );
}
