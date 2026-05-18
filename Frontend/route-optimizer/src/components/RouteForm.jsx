import { useState } from "react";
import toast from "react-hot-toast";
import { getBestRoute } from "../lib/api";
import {
  TbRoute,
  TbLeaf,
  TbBolt,
  TbCoin,
  TbTruckDelivery,
  TbChevronDown,
} from "react-icons/tb";

export default function RouteForm({ onResult }) {
  const [start, setStart] = useState("Depot_0");
  const [end, setEnd] = useState("Depot_10");
  const [preference, setPreference] = useState("greenest");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async e => {
    e.preventDefault();
    if (start === end) {
      toast.error("Start and end depots must be different.");
      return;
    }
    setLoading(true);
    try {
      const data = await getBestRoute({ start, end, preference });
      onResult(data);
      toast.success("Route calculated!");
    } catch (err) {
      const msg = err?.message || "Could not calculate route.";
      toast.error(msg);
      onResult(null);
    } finally {
      setLoading(false);
    }
  };

  /* ────── Helper to DRY the selects ───── */
  const depotOptions = Array.from({ length: 50 }, (_, i) => (
    <option key={i} value={`Depot_${i}`}>{`Depot ${i}`}</option>
  ));

  /* ────── Preference option mapping ───── */
  const preferenceOptions = {
    greenest: { 
      icon: <TbLeaf size={18} />, 
      label: "Eco-friendly", 
      color: "bg-green-200 text-green-600",
      description: "Prioritizes routes with lowest carbon emissions"
    },
    fastest: { 
      icon: <TbBolt size={18} />, 
      label: "Time-efficient", 
      color: "bg-blue-100 text-blue-600",
      description: "Prioritizes routes with shortest travel time"
    },
    cheapest: { 
      icon: <TbCoin size={18} />, 
      label: "Cost-effective", 
      color: "bg-amber-100 text-amber-600",
      description: "Prioritizes routes with lowest operational costs"
    }
  };

  const current = preferenceOptions[preference];

  /* ────── UI ───── */
  return (
    <form onSubmit={handleSubmit} className=" bg-emerald-50/80 backdrop-blur-md  shadow-lg border border-gray-100 p-6 max-w-md w-full h-[99.99%]">
      <div className="flex flex-col gap-6">
        {/* Header with new design */}
        <div className="flex items-center justify-between pb-4 border-b border-gray-100">
          <h2 className="flex items-center gap-2 text-xl font-bold text-gray-800">
            <div className="bg-emerald-100 text-emerald-600 p-2 rounded-lg">
              <TbRoute size={20} />
            </div>
            Route Optimizer
          </h2>
          
          <div className="flex space-x-1">
            {Object.entries(preferenceOptions).map(([key, { icon, color }]) => (
              <button 
                key={key}
                type="button" // Important to not submit the form
                onClick={() => setPreference(key)}
                className={`rounded-full p-2 transition-all duration-200 ${
                  preference === key 
                    ? color + " ring-2 ring-offset-2 ring-offset-white " + color.replace("bg-", "ring-").replace("-100", "-300")
                    : "bg-gray-100 text-gray-400 hover:text-gray-600"
                }`}
                title={key.charAt(0).toUpperCase() + key.slice(1)}
              >
                {icon}
              </button>
            ))}
          </div>
        </div>

        {/* Selected preference summary */}
        <div className={`${current.color} rounded-lg px-4 py-3 flex items-center justify-between`}>
          <div className="flex items-center gap-3">
            {current.icon}
            <div>
              <div className="font-medium">{preference.charAt(0).toUpperCase() + preference.slice(1)} Route</div>
              <div className="text-xs opacity-80">{current.description}</div>
            </div>
          </div>
          <button 
            type="button" // Important to not submit the form
            onClick={() => setPreference(Object.keys(preferenceOptions)[(Object.keys(preferenceOptions).indexOf(preference) + 1) % 3])}
            className="text-xs bg-white bg-opacity-20 hover:bg-opacity-30 rounded-full py-1 px-2 flex items-center gap-1 transition-colors"
          >
            Change
            <TbChevronDown size={12} />
          </button>
        </div>

        <div className="grid grid-cols-2 gap-4">
          {/* Start depot */}
          <Field label="Start Depot" icon={<TbTruckDelivery />}>
            <select
              value={start}
              onChange={e => setStart(e.target.value)}
              className="border border-gray-200 rounded-lg px-3 py-2 w-full focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500 transition-all duration-200"
            >
              {depotOptions}
            </select>
          </Field>

          {/* End depot */}
          <Field label="End Depot" icon={<TbTruckDelivery />}>
            <select
              value={end}
              onChange={e => setEnd(e.target.value)}
              className="border border-gray-200 rounded-lg px-3 py-2 w-full focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500 transition-all duration-200"
            >
              {depotOptions}
            </select>
          </Field>
        </div>

        {/* Submit */}
        <button
          type="submit"
          disabled={loading}
          className="w-full py-3 rounded-lg text-white font-medium
                    bg-gradient-to-r from-emerald-600 to-emerald-500
                    hover:from-emerald-700 hover:to-emerald-600
                    disabled:opacity-60 disabled:cursor-not-allowed
                    focus:outline-none focus:ring-4
                    focus:ring-emerald-500/30 transition-all duration-200
                    shadow-md hover:shadow-lg active:shadow-sm flex items-center justify-center gap-2"
        >
          {loading ? (
            <>
              <Spinner /> Calculating optimal route...
            </>
          ) : (
            <>
              <TbRoute size={18} /> Calculate Optimal Route
            </>
          )}
        </button>
        
      </div>
    </form>
  );
}

/* ─────────────────────────────
   Reusable components
─────────────────────────────*/
function Field({ label, children, icon }) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2 text-sm font-medium text-gray-700">
        <div className="text-gray-500">{icon}</div>
        {label}
      </div>
      {children}
    </div>
  );
}

function Spinner() {
  return (
    <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
    </svg>
  );
}