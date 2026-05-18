// Emissions.jsx - CO2 tracking and sustainability dashboard
import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { getCompanyStats } from "../lib/api";
import { 
  FaDownload, 
  FaCalendarAlt, 
  FaLeaf, 
  FaGasPump, 
  FaClock, 
  FaCoins,
  FaChevronUp,
  FaChartPie,
  FaChartLine,
  FaTree,
  FaMedal,
  FaChartBar
} from "react-icons/fa";
import { TbTruckDelivery, TbChartLine, TbRoad, TbMapPin, TbHome, TbCalendarStats } from "react-icons/tb";
import Topbar from "../components/Topbar";
import Sidebar from "../components/Sidebar";
import Logo from "../assets/logo.png";

export default function Emissions() {
  const [currentTab, setCurrentTab] = useState('emissions');
  const [period, setPeriod] = useState('month');
  const [dataLoaded, setDataLoaded] = useState(false);
  const [activeTab, setActiveTab] = useState('overview');
  const [showFilterDrawer, setShowFilterDrawer] = useState(false);
  const [companyStats, setCompanyStats] = useState(null);

  const navigate = useNavigate();
  const userInitials = (localStorage.getItem('fullName') || '')
    .split(' ').map(n => n[0]).filter(Boolean).join('').slice(0, 2).toUpperCase() || '?';

  const _buildData = (stats) => {
    const total = stats?.total_emission ?? 0;
    const nv = Math.min(stats?.num_drivers ?? 4, 4);
    const props = [0.25, 0.22, 0.32, 0.21].slice(0, nv);
    return {
      total,
      previousPeriod: total > 0 ? +(total * 1.055).toFixed(1) : 0,
      reduction: total > 0 ? 5.2 : 0,
      byVehicle: props.map((p, i) => {
        const em = +(total * p).toFixed(1);
        return { id: `truck-${i+1}`, name: `Truck ${String(i+1).padStart(2,'0')}`,
          emissions: em, distance: +(em / 0.266).toFixed(0), fuel: +(em / 2.7).toFixed(1) };
      }),
      byRoute: [
        { id: 'r1', name: 'City Routes',    emissions: +(total * 0.33).toFixed(1), count: 25 },
        { id: 'r2', name: 'Highway Routes', emissions: +(total * 0.30).toFixed(1), count: 18 },
        { id: 'r3', name: 'Rural Routes',   emissions: +(total * 0.37).toFixed(1), count: 22 },
      ],
      monthlyData: ['Jan','Feb','Mar','Apr','May','Jun'].map((month, i) => ({
        month, emissions: Math.round(total * [1.11,1.08,1.05,1.0,1.11,1.03][i])
      })),
    };
  };

  const emissionsData = _buildData(companyStats);

  // Top stats for the Topbar
  const emissionsStats = [
    { 
      icon: <FaLeaf className="text-emerald-600" size={18} />, 
      label: "Total CO₂", 
      value: `${emissionsData.total.toLocaleString()} kg` 
    },
    { 
      icon: <FaChartBar className="text-amber-500" size={18} />, 
      label: "Reduction", 
      value: `${emissionsData.reduction}%` 
    },
    { 
      icon: <FaGasPump className="text-blue-500" size={18} />, 
      label: "Fuel Saved", 
      value: `${(emissionsData.previousPeriod - emissionsData.total) / 3} L` 
    },
    { 
      icon: <FaTree className="text-green-600" size={18} />, 
      label: "Carbon Offset", 
      value: `${(emissionsData.total * 0.05).toFixed(1)} kg` 
    }
  ];

  useEffect(() => {
    getCompanyStats()
      .then(data => { setCompanyStats(data); setDataLoaded(true); })
      .catch(() => setDataLoaded(true));
  }, []);


  return (
    /* Page wrapper with the same gradient background as RoutePlanner */
    <div className="flex flex-col h-screen font-sans select-none
                    bg-gradient-to-br from-emerald-100 via-emerald-50 to-white
                    [background-image:radial-gradient(circle_at_15%_15%,rgba(16,185,129,.25)_0%,transparent_55%),
                                     radial-gradient(circle_at_85%_75%,rgba(5,150,105,.2)_0%,transparent_45%)]">

      {/* Use the same Topbar component */}
      <Topbar
        logoSrc={Logo}
        appName="OptiGo"
        stats={emissionsStats}
        showLiveIndicator={true}
        userInitials={userInitials}
        onHomeClick={() => navigate('/plan')}
        onMapClick={() => navigate('/tracking')}
        onProfileClick={() => navigate('/settings')}
      />

      <div className="flex flex-1 overflow-hidden relative">
        {/* Import the Sidebar as a separate component */}
        <Sidebar currentTab={currentTab} onTabChange={setCurrentTab} />

        {/* ── Main content area ── */}
        <div className="flex flex-1 flex-col md:flex-row overflow-hidden relative">
          
          {/* ── Filter panel (desktop) ── */}
          <aside className="hidden md:block w-[300px] bg-emerald-50 
                          overflow-y-auto border-r border-emerald-100 z-10 p-6">
            <div className="mb-6">
              <h3 className="text-lg font-bold text-emerald-800 mb-4">Emissions Filters</h3>
              <div className="space-y-4">
                <FilterSection title="Time Period">
                  <div className="grid grid-cols-3 gap-2">
                    <PeriodButton active={period === 'week'} onClick={() => setPeriod('week')}>Week</PeriodButton>
                    <PeriodButton active={period === 'month'} onClick={() => setPeriod('month')}>Month</PeriodButton>
                    <PeriodButton active={period === 'year'} onClick={() => setPeriod('year')}>Year</PeriodButton>
                  </div>
                </FilterSection>
                
                <FilterSection title="Date Range">
                  <div className="space-y-2">
                    <DateInput label="From" defaultValue="2025-04-21" />
                    <DateInput label="To" defaultValue="2025-05-21" />
                  </div>
                </FilterSection>
                
                <FilterSection title="Vehicles">
                  <div className="space-y-1.5">
                    <CheckboxItem label="Truck 01" checked={true} />
                    <CheckboxItem label="Truck 02" checked={true} />
                    <CheckboxItem label="Truck 03" checked={true} />
                    <CheckboxItem label="Truck 04" checked={true} />
                  </div>
                </FilterSection>
                
                <FilterSection title="Routes">
                  <div className="space-y-1.5">
                    <CheckboxItem label="City Center" checked={true} />
                    <CheckboxItem label="Highway North" checked={true} />
                    <CheckboxItem label="Mountain Pass" checked={true} />
                  </div>
                </FilterSection>
              </div>
              
              <button className="w-full mt-6 py-2.5 bg-emerald-600 hover:bg-emerald-700 
                               text-white rounded-lg font-medium transition-colors">
                Apply Filters
              </button>
            </div>
            
            <div className="mt-8 p-4 bg-emerald-100/50 rounded-lg border border-emerald-200">
              <h4 className="font-medium flex items-center gap-2 text-emerald-800 mb-2">
                <FaMedal className="text-amber-500" /> Sustainability Goal
              </h4>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-medium text-emerald-700">2025 Target</span>
                <span className="text-xs font-medium text-emerald-700">15% Reduction</span>
              </div>
              <div className="w-full h-3 bg-emerald-200 rounded-full overflow-hidden">
                <div className="h-full bg-emerald-600 rounded-full" style={{ width: `${Math.min(100, emissionsData.reduction / 0.15)}%` }}></div>
              </div>
              <div className="mt-2 text-xs text-emerald-800">
                Current progress: {(emissionsData.reduction / 0.15 * 100).toFixed(1)}% of yearly goal
              </div>
            </div>
          </aside>

          {/* ── Main content container ── */}
          <div className="flex-1 flex flex-col overflow-hidden">
            {/* Tab navigation */}
            <div className="flex bg-white/80 backdrop-blur-sm border-b border-emerald-100 
                          px-6 pt-4 overflow-x-auto hide-scrollbar">
              <TabButton 
                active={activeTab === 'overview'} 
                onClick={() => setActiveTab('overview')}
                icon={<FaChartPie />}
                label="Overview"
              />
              <TabButton 
                active={activeTab === 'vehicles'} 
                onClick={() => setActiveTab('vehicles')}
                icon={<TbTruckDelivery />}
                label="By Vehicle"
              />
              <TabButton 
                active={activeTab === 'routes'} 
                onClick={() => setActiveTab('routes')}
                icon={<TbRoad />}
                label="By Route"
              />
              <TabButton 
                active={activeTab === 'trends'} 
                onClick={() => setActiveTab('trends')}
                icon={<FaChartLine />}
                label="Trends"
              />
              <TabButton 
                active={activeTab === 'reports'} 
                onClick={() => setActiveTab('reports')}
                icon={<TbCalendarStats />}
                label="Reports"
              />
            </div>
            
            {/* Main dashboard content */}
            <div className={`flex-1 overflow-y-auto p-6 transition-opacity duration-1000 
                           ${dataLoaded ? 'opacity-100' : 'opacity-0'}`}>
              {/* Overview Tab */}
              {activeTab === 'overview' && (
                <div className="space-y-8">
                  {/* Header with period selector */}
                  <div className="flex flex-col md:flex-row justify-between md:items-center gap-4">
                    <div>
                      <h1 className="text-2xl font-bold text-emerald-800">
                        Emissions Dashboard
                      </h1>
                      <p className="text-gray-600">
                        Tracking total CO₂ emissions across your fleet
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-gray-600">{new Date().toLocaleString('default',{month:'long',year:'numeric'})}</span>
                      <button className="p-2 rounded-lg border border-emerald-200 
                                       hover:bg-emerald-100 text-emerald-700">
                        <FaCalendarAlt />
                      </button>
                    </div>
                  </div>
                  
                  {/* Stats cards */}
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                    <StatCard 
                      title="Total Emissions"
                      value={`${emissionsData.total.toLocaleString()} kg`}
                      icon={<FaLeaf size={20} />}
                      trend={-emissionsData.reduction}
                      color="emerald"
                    />
                    <StatCard 
                      title="Total Distance"
                      value={`${emissionsData.byVehicle.reduce((sum, v) => sum + v.distance, 0).toLocaleString()} km`}
                      icon={<TbRoad size={22} />}
                      trend={-2.8}
                      color="blue"
                    />
                    <StatCard 
                      title="Fuel Consumption"
                      value={`${emissionsData.byVehicle.reduce((sum, v) => sum + v.fuel, 0).toLocaleString()} L`}
                      icon={<FaGasPump size={18} />}
                      trend={-5.6}
                      color="amber"
                    />
                    <StatCard 
                      title="Carbon Offset"
                      value={`${(emissionsData.total * 0.05).toFixed(1)} kg`}
                      icon={<FaTree size={20} />}
                      trend={+15.2}
                      color="green"
                    />
                  </div>
                  
                  {/* Charts section */}
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    {/* Emissions chart */}
                    <div className="bg-white rounded-xl shadow-sm border border-emerald-100 p-5">
                      <div className="flex justify-between items-center mb-6">
                        <h3 className="font-bold text-gray-800">Monthly Emissions Trend</h3>
                        <button className="text-xs px-3 py-1 rounded-full bg-emerald-100 text-emerald-800">
                          Last 6 Months
                        </button>
                      </div>
                      <div className="h-64 flex items-end justify-between gap-2 pt-4 border-b border-emerald-100">
                        {emissionsData.monthlyData.map((item, i) => (
                          <div key={i} className="flex flex-col items-center gap-2 flex-1">
                            <div className="text-xs font-medium text-gray-500">{(item.emissions / 1000).toFixed(1)}T</div>
                            <div 
                              className={`w-full rounded-t-lg ${item.month === 'Apr' ? 'bg-emerald-500' : 'bg-emerald-300'}`} 
                              style={{ height: `${(item.emissions / 1500) * 100}%` }}
                            ></div>
                            <div className="text-xs font-medium">{item.month}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                    
                    {/* Emissions by vehicle */}
                    <div className="bg-white rounded-xl shadow-sm border border-emerald-100 p-5">
                      <div className="flex justify-between items-center mb-6">
                        <h3 className="font-bold text-gray-800">Emissions by Vehicle</h3>
                        <button className="text-xs px-3 py-1 rounded-full bg-emerald-100 text-emerald-800">
                          View All
                        </button>
                      </div>
                      <div className="space-y-4">
                        {emissionsData.byVehicle.map((vehicle, i) => (
                          <div key={i} className="flex flex-col">
                            <div className="flex justify-between text-sm mb-1">
                              <span className="font-medium">{vehicle.name}</span>
                              <span>{vehicle.emissions.toLocaleString()} kg</span>
                            </div>
                            <div className="w-full h-2 bg-emerald-100 rounded-full overflow-hidden">
                              <div 
                                className="h-full bg-emerald-500" 
                                style={{ width: `${(vehicle.emissions / 500) * 100}%` }}
                              ></div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                  
                  {/* Sustainability section */}
                  <div className="bg-gradient-to-r from-emerald-50 to-emerald-100 
                                rounded-xl p-6 border border-emerald-200">
                    <h3 className="text-lg font-bold text-emerald-800 mb-3">
                      Sustainability Insights
                    </h3>
                    
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                      <SustainabilityCard 
                        title="Trees Equivalent" 
                        value={`${Math.round(emissionsData.total / 21)} trees`}
                        icon={<FaTree />}
                        description="Trees needed to offset CO₂"
                      />
                      <SustainabilityCard 
                        title="Optimization Potential" 
                        value="12.8% reduction"
                        icon={<TbChartLine />}
                        description="Possible with route optimization"
                      />
                      <SustainabilityCard 
                        title="Green Fleet Target" 
                        value="25% complete"
                        icon={<TbTruckDelivery />}
                        description="Progress toward green fleet goal"
                      />
                    </div>
                    
                    <button className="flex items-center gap-2 text-emerald-700 font-medium
                                     hover:text-emerald-800 transition-colors">
                      <span>View Full Sustainability Report</span>
                      <FaDownload size={14} />
                    </button>
                  </div>
                </div>
              )}
              
              {/* By Vehicle Tab - Simple placeholder */}
              {activeTab === 'vehicles' && (
                <div className="space-y-6">
                  <h2 className="text-xl font-bold text-emerald-800">Emissions by Vehicle</h2>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {emissionsData.byVehicle.map((vehicle, i) => (
                      <VehicleCard key={i} vehicle={vehicle} />
                    ))}
                  </div>
                </div>
              )}
              
              {/* Placeholder for other tabs */}
              {(activeTab === 'routes' || activeTab === 'trends' || activeTab === 'reports') && (
                <div className="h-full flex flex-col items-center justify-center text-gray-500">
                  <div className="p-6 rounded-full bg-emerald-100/50 mb-4">
                    {activeTab === 'routes' && <TbRoad size={48} />}
                    {activeTab === 'trends' && <FaChartLine size={48} />}
                    {activeTab === 'reports' && <TbCalendarStats size={48} />}
                  </div>
                  <h3 className="text-xl font-medium text-emerald-800 mb-2">
                    {activeTab === 'routes' && 'Route Analysis'}
                    {activeTab === 'trends' && 'Emissions Trends'}
                    {activeTab === 'reports' && 'Reports & Documents'}
                  </h3>
                  <p>This feature is coming soon</p>
                </div>
              )}
            </div>
            
            {/* Status bar */}
            <div className="flex justify-between bg-emerald-50/80 backdrop-blur-md
                          h-12 items-center px-6 border-t border-emerald-100">
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></div>
                  <span className="text-xs font-medium text-gray-600">Live Data</span>
                </div>
                <div className="text-xs text-gray-500">Last updated: {new Date().toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})}</div>
              </div>
              <div className="text-xs font-medium text-gray-600">
                {dataLoaded ? `${companyStats?.num_drivers ?? 0} driver${(companyStats?.num_drivers ?? 0) !== 1 ? 's' : ''} monitored` : 'Loading data...'}
              </div>
            </div>
          </div>
        </div>
      </div>
      
      {/* Mobile filter button */}
      <div className="absolute bottom-6 right-6 z-20 md:hidden">
        <ActionFab onClick={() => setShowFilterDrawer(true)} icon={<FaChartBar />} text="Filter" />
      </div>
      
      {/* Mobile filters drawer */}
      {showFilterDrawer && (
        <MobileDrawer title="Emissions Filters" onClose={() => setShowFilterDrawer(false)}>
          <div className="space-y-4">
            <FilterSection title="Time Period">
              <div className="grid grid-cols-3 gap-2">
                <PeriodButton active={period === 'week'} onClick={() => setPeriod('week')}>Week</PeriodButton>
                <PeriodButton active={period === 'month'} onClick={() => setPeriod('month')}>Month</PeriodButton>
                <PeriodButton active={period === 'year'} onClick={() => setPeriod('year')}>Year</PeriodButton>
              </div>
            </FilterSection>
            
            <FilterSection title="Date Range">
              <div className="space-y-2">
                <DateInput label="From" defaultValue="2025-04-21" />
                <DateInput label="To" defaultValue="2025-05-21" />
              </div>
            </FilterSection>
            
            <FilterSection title="Vehicles">
              <div className="space-y-1.5">
                <CheckboxItem label="Truck 01" checked={true} />
                <CheckboxItem label="Truck 02" checked={true} />
                <CheckboxItem label="Truck 03" checked={true} />
                <CheckboxItem label="Truck 04" checked={true} />
              </div>
            </FilterSection>
            
            <button className="w-full mt-4 py-3 bg-emerald-600 hover:bg-emerald-700 
                             text-white rounded-lg font-medium transition-colors">
              Apply Filters
            </button>
          </div>
        </MobileDrawer>
      )}
    </div>
  );
}

/* —————————————————————————————————————————— */
/* Helper components */

function FilterSection({ title, children }) {
  return (
    <div>
      <h4 className="text-sm font-semibold text-emerald-800 mb-2">{title}</h4>
      {children}
    </div>
  );
}

function DateInput({ label, defaultValue }) {
  return (
    <div className="flex flex-col">
      <label className="text-xs text-emerald-700 mb-1">{label}</label>
      <input 
        type="date" 
        defaultValue={defaultValue}
        className="px-3 py-1.5 border border-emerald-200 rounded-lg text-sm 
                 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
      />
    </div>
  );
}

function PeriodButton({ active, onClick, children }) {
  return (
    <button 
      onClick={onClick}
      className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors
                ${active 
                  ? 'bg-emerald-600 text-white' 
                  : 'bg-emerald-100/70 text-emerald-800 hover:bg-emerald-200'}`}
    >
      {children}
    </button>
  );
}

function CheckboxItem({ label, checked }) {
  const [isChecked, setIsChecked] = useState(checked);
  
  return (
    <label className="flex items-center gap-2 cursor-pointer">
      <input 
        type="checkbox"
        checked={isChecked}
        onChange={() => setIsChecked(!isChecked)}
        className="w-4 h-4 accent-emerald-600 rounded"
      />
      <span className="text-sm text-emerald-800">{label}</span>
    </label>
  );
}

function TabButton({ active, onClick, icon, label }) {
  return (
    <button 
      onClick={onClick}
      className={`flex items-center gap-2 px-4 py-2.5 border-b-2 transition-colors whitespace-nowrap
                ${active 
                  ? 'border-emerald-600 text-emerald-800' 
                  : 'border-transparent text-gray-500 hover:text-emerald-700'}`}
    >
      <span className={active ? 'text-emerald-600' : ''}>{icon}</span>
      <span className="font-medium">{label}</span>
    </button>
  );
}

function StatCard({ title, value, icon, trend, color }) {
  const getColorClass = (baseColor) => {
    const colorMap = {
      emerald: {
        light: 'bg-emerald-50/70 border-emerald-200',
        icon: 'bg-emerald-100 text-emerald-700',
        value: 'text-emerald-800',
        positive: 'text-emerald-600',
        negative: 'text-rose-600'
      },
      blue: {
        light: 'bg-blue-50/70 border-blue-200',
        icon: 'bg-blue-100 text-blue-700', 
        value: 'text-blue-800',
        positive: 'text-emerald-600',
        negative: 'text-rose-600'
      },
      amber: {
        light: 'bg-amber-50/70 border-amber-200',
        icon: 'bg-amber-100 text-amber-700',
        value: 'text-amber-800',
        positive: 'text-emerald-600',
        negative: 'text-rose-600'
      },
      green: {
        light: 'bg-green-50/70 border-green-200',
        icon: 'bg-green-100 text-green-700',
        value: 'text-green-800',
        positive: 'text-emerald-600',
        negative: 'text-rose-600'
      }
    };
    
    return colorMap[baseColor] || colorMap.emerald;
  };
  
  const colors = getColorClass(color);
  
  return (
    <div className={`rounded-xl p-5 border ${colors.light}`}>
      <div className="flex justify-between items-start">
        <div>
          <p className="text-gray-500 text-sm mb-1">{title}</p>
          <h3 className={`text-xl font-bold ${colors.value}`}>{value}</h3>
        </div>
        <div className={`p-2 rounded-lg ${colors.icon}`}>
          {icon}
        </div>
      </div>
      <div className="mt-2 flex items-center gap-1">
        <span className={trend > 0 ? colors.positive : colors.negative}>
          {trend > 0 ? '+' : ''}{trend}%
        </span>
        <span className="text-xs text-gray-500">vs. last period</span>
      </div>
    </div>
  );
}

function SustainabilityCard({ title, value, icon, description }) {
  return (
    <div className="bg-white/60 backdrop-blur-sm rounded-lg p-4 border border-emerald-200">
      <div className="flex items-start gap-3">
        <div className="p-2 rounded-lg bg-emerald-600 text-white">
          {icon}
        </div>
        <div>
          <h4 className="font-medium text-emerald-900">{title}</h4>
          <p className="text-lg font-bold text-emerald-700">{value}</p>
          <p className="text-xs text-emerald-600 mt-1">{description}</p>
        </div>
      </div>
    </div>
  );
}

function VehicleCard({ vehicle }) {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-emerald-100 p-5">
      <div className="flex justify-between items-start mb-4">
        <div>
          <h3 className="font-bold text-emerald-800">{vehicle.name}</h3>
          <p className="text-emerald-600 text-sm">ID: {vehicle.id}</p>
        </div>
        <div className="p-2 rounded-lg bg-emerald-100 text-emerald-700">
          <TbTruckDelivery size={22} />
        </div>
      </div>
      
      <div className="grid grid-cols-2 gap-3 mb-4">
        <div className="p-3 bg-emerald-50 rounded-lg">
          <div className="text-xs text-emerald-700 mb-1">CO₂ Emissions</div>
          <div className="font-bold">{vehicle.emissions.toLocaleString()} kg</div>
        </div>
        <div className="p-3 bg-emerald-50 rounded-lg">
          <div className="text-xs text-emerald-700 mb-1">Distance</div>
          <div className="font-bold">{vehicle.distance.toLocaleString()} km</div>
        </div>
        <div className="p-3 bg-emerald-50 rounded-lg">
          <div className="text-xs text-emerald-700 mb-1">Fuel Consumed</div>
          <div className="font-bold">{vehicle.fuel.toLocaleString()} L</div>
        </div>
        <div className="p-3 bg-emerald-50 rounded-lg">
          <div className="text-xs text-emerald-700 mb-1">Efficiency</div>
          <div className="font-bold">{(vehicle.distance / vehicle.fuel).toFixed(1)} km/L</div>
        </div>
      </div>
      
      <button className="text-sm font-medium text-emerald-700 hover:text-emerald-800 
                       flex items-center gap-1.5">
        <span>View Detailed Report</span>
        <FaChartLine size={14} />
      </button>
    </div>
  );
}

function ActionFab({ onClick, icon, text }) {
  return (
    <button
      onClick={onClick}
      className="bg-emerald-600 text-white px-5 py-3 rounded-full shadow-lg
               active:scale-95 transition-all flex items-center gap-2
               hover:bg-emerald-700 border border-emerald-500"
    >
      {icon} <span className="font-medium">{text}</span>
    </button>
  );
}

function MobileDrawer({ title, onClose, children }) {
  return (
    <div className="fixed bottom-0 left-0 right-0 bg-emerald-50 rounded-t-3xl p-6 shadow-2xl
                   max-h-[90vh] overflow-y-auto z-50 animate-slideUp">
      <div className="flex flex-col items-center mb-6">
        <div className="w-12 h-1 bg-emerald-200 rounded-full mb-4"></div>
        <div className="flex justify-between items-center w-full">
          <h2 className="text-lg font-bold text-emerald-800">{title}</h2>
          <button onClick={onClose} className="text-emerald-600 p-2">
            <FaChevronUp />
          </button>
        </div>
      </div>
      {children}
    </div>
  );
}