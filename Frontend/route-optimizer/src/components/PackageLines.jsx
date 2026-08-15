import { TbBox, TbTrash } from "react-icons/tb";
import { Button, Chip, Field, NumberInput, Select, TextInput } from "./ui";

export const PACKAGE_TYPES = ["parcel", "pallet", "crate", "roll_cage", "bulk", "container", "other"];

export const emptyPackage = () => ({
  description: "",
  package_type: "parcel",
  quantity: 1,
  weight_kg: "",
  length_cm: "",
  width_cm: "",
  height_cm: "",
  fragile: false,
  hazardous: false,
  temperature_controlled: false,
  temp_max_c: "",
  value_gbp: "",
  barcode: "",
});

/** Normalise the form values into the shape the API expects. */
export const serializePackages = (packages = []) =>
  packages.map((pkg) => ({
    ...pkg,
    quantity: Number(pkg.quantity) || 1,
    weight_kg: pkg.weight_kg === "" ? 0 : Number(pkg.weight_kg),
    length_cm: pkg.length_cm === "" ? 0 : Number(pkg.length_cm),
    width_cm: pkg.width_cm === "" ? 0 : Number(pkg.width_cm),
    height_cm: pkg.height_cm === "" ? 0 : Number(pkg.height_cm),
    temp_max_c: pkg.temp_max_c === "" ? null : Number(pkg.temp_max_c),
    value_gbp: pkg.value_gbp === "" ? 0 : Number(pkg.value_gbp),
  }));

export const summarisePackages = (packages = []) =>
  packages.reduce(
    (totals, pkg) => {
      const quantity = Number(pkg.quantity) || 1;
      const weight = (Number(pkg.weight_kg) || 0) * quantity;
      const volume =
        ((Number(pkg.length_cm) || 0) * (Number(pkg.width_cm) || 0) * (Number(pkg.height_cm) || 0)) /
        1_000_000 * quantity;
      return {
        count: totals.count + quantity,
        weight: totals.weight + weight,
        volume: totals.volume + volume,
        chilled: totals.chilled || Boolean(pkg.temperature_controlled),
      };
    },
    { count: 0, weight: 0, volume: 0, chilled: false }
  );

/**
 * Editable package lines (weight, dimensions, handling flags) shared by the
 * planner's ad-hoc stops and the Orders screen.
 */
export default function PackageLines({ packages = [], onChange, compact = false }) {
  const update = (index, patch) =>
    onChange(packages.map((pkg, i) => (i === index ? { ...pkg, ...patch } : pkg)));

  const totals = summarisePackages(packages);

  return (
    <div className="space-y-2">
      {packages.map((pkg, index) => (
        <div key={index} className="rounded-lg bg-gray-50 border border-gray-200 p-2.5 space-y-2">
          <div className={`grid gap-2 ${compact ? "grid-cols-4" : "grid-cols-2 md:grid-cols-5"}`}>
            <Field label="Description" className={compact ? "col-span-2" : "md:col-span-2"}>
              <TextInput value={pkg.description} placeholder="Chilled pallets"
                onChange={(value) => update(index, { description: value })} />
            </Field>
            <Field label="Type">
              <Select value={pkg.package_type} onChange={(value) => update(index, { package_type: value })}>
                {PACKAGE_TYPES.map((type) => (
                  <option key={type} value={type}>{type.replace("_", " ")}</option>
                ))}
              </Select>
            </Field>
            <Field label="Qty">
              <NumberInput min={1} value={pkg.quantity} onChange={(value) => update(index, { quantity: value })} />
            </Field>
            {!compact && (
              <Field label="Barcode / ref">
                <TextInput value={pkg.barcode} onChange={(value) => update(index, { barcode: value })} />
              </Field>
            )}
          </div>

          <div className="grid grid-cols-4 gap-2">
            <Field label="Weight (kg)">
              <NumberInput min={0} value={pkg.weight_kg} onChange={(value) => update(index, { weight_kg: value })} />
            </Field>
            <Field label="L (cm)">
              <NumberInput min={0} value={pkg.length_cm} onChange={(value) => update(index, { length_cm: value })} />
            </Field>
            <Field label="W (cm)">
              <NumberInput min={0} value={pkg.width_cm} onChange={(value) => update(index, { width_cm: value })} />
            </Field>
            <Field label="H (cm)">
              <NumberInput min={0} value={pkg.height_cm} onChange={(value) => update(index, { height_cm: value })} />
            </Field>
          </div>

          <div className="flex flex-wrap items-center gap-3 text-[11px] text-gray-600">
            {[["fragile", "Fragile"], ["hazardous", "Hazardous"], ["temperature_controlled", "Chilled"]].map(
              ([field, label]) => (
                <label key={field} className="flex items-center gap-1 cursor-pointer">
                  <input type="checkbox" className="accent-emerald-600" checked={Boolean(pkg[field])}
                    onChange={(event) => update(index, { [field]: event.target.checked })} />
                  {label}
                </label>
              )
            )}
            {pkg.temperature_controlled && (
              <label className="flex items-center gap-1">
                max °C
                <input type="number" value={pkg.temp_max_c}
                  onChange={(event) => update(index, { temp_max_c: event.target.value })}
                  className="w-14 px-1.5 py-0.5 border border-gray-300 rounded" />
              </label>
            )}
            <label className="flex items-center gap-1">
              Value £
              <input type="number" value={pkg.value_gbp}
                onChange={(event) => update(index, { value_gbp: event.target.value })}
                className="w-20 px-1.5 py-0.5 border border-gray-300 rounded" />
            </label>
            <button type="button" onClick={() => onChange(packages.filter((_, i) => i !== index))}
              className="ml-auto flex items-center gap-1 text-rose-600 hover:underline">
              <TbTrash size={13} /> Remove
            </button>
          </div>

          {pkg.temperature_controlled && <Chip tone="blue">Needs a temperature-controlled vehicle</Chip>}
        </div>
      ))}

      <div className="flex items-center justify-between gap-2">
        <Button size="sm" variant="secondary" icon={<TbBox size={14} />}
          onClick={() => onChange([...packages, emptyPackage()])}>
          Add package line
        </Button>
        {packages.length > 0 && (
          <span className="text-[11px] text-gray-500">
            {totals.count} item(s) · {totals.weight.toFixed(1)} kg · {totals.volume.toFixed(2)} m³
          </span>
        )}
      </div>
    </div>
  );
}
