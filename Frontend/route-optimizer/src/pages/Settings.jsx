// Settings.jsx - Complete settings page with Topbar and Sidebar integration
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { 
  FaSave, 
  FaUser, 
  FaBell, 
  FaShieldAlt, 
  FaGlobe,
  FaPalette,
  FaTruck,
  FaChartBar,
  FaDatabase,
  FaCloudUploadAlt,
  FaDownload,
  FaTrash,
  FaEdit,
  FaCheck,
  FaTimes,
  FaEye,
  FaEyeSlash,
  FaChevronRight,
  FaChevronUp,
  FaInfoCircle,
  FaExclamationTriangle
} from "react-icons/fa";
import { 
  TbSettings, 
  TbUserCircle, 
  TbBellRinging, 
  TbShield, 
  TbWorld,
  TbPalette,
  TbTruck,
  TbChartBar,
  TbDatabase,
  TbCloud,
  TbDownload,
  TbTrash,
  TbDeviceDesktop,
  TbMoon,
  TbSun
} from "react-icons/tb";
import Topbar from "../components/Topbar";
import Sidebar from "../components/Sidebar";
import Logo from "../assets/logo.png";

export default function Settings() {
  const navigate = useNavigate();
  const [currentTab, setCurrentTab] = useState('settings');
  const [activeSection, setActiveSection] = useState('profile');
  const [mobileSettingsOpen, setMobileSettingsOpen] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [saveStatus, setSaveStatus] = useState(null); // 'saving' | 'saved' | null

  // Load real profile from localStorage (populated on login)
  const _fullName = localStorage.getItem('fullName') || '';
  const [firstName, ...rest] = _fullName.split(' ');
  const _defaultProfile = {
    firstName: firstName || '',
    lastName:  rest.join(' ') || '',
    email:     localStorage.getItem('email')       || '',
    phone:     '',
    role:      localStorage.getItem('userRole')    || 'driver',
    department: localStorage.getItem('companyName') || '',
    avatar: null,
  };

  // Settings state
  const [settings, setSettings] = useState({
    profile: _defaultProfile,
    
    // Notification settings
    // notifications: {
    //   email: {
    //     routeUpdates: true,
    //     fuelAlerts: true,
    //     maintenanceReminders: true,
    //     performanceReports: false,
    //     systemUpdates: true
    //   },
    //   push: {
    //     routeDeviations: true,
    //     emergencyAlerts: true,
    //     deliveryUpdates: true,
    //     trafficAlerts: false
    //   },
    //   sms: {
    //     criticalAlerts: true,
    //     deliveryConfirmations: false
    //   }
    // },
    
    // Security settings
    // security: {
    //   twoFactorAuth: false,
    //   sessionTimeout: 30,
    //   loginNotifications: true,
    //   passwordExpiry: 90
    // },
    
    // System preferences
    preferences: {
      theme: 'light',
      language: 'en',
      timezone: 'Europe/London',
      dateFormat: 'DD/MM/YYYY',
      distanceUnit: 'km',
      fuelUnit: 'liters',
      currency: 'GBP'
    },
    
    // Fleet settings
    // fleet: {
    //   defaultFuelEfficiency: 8.5,
    //   maintenanceThreshold: 10000,
    //   speedLimitBuffer: 5,
    //   idleTimeAlert: 15
    // }
  });

  const userInitials = _fullName
    .split(' ').map(n => n[0]).filter(Boolean).join('').slice(0, 2).toUpperCase() || '?';

  const role = localStorage.getItem('userRole') || 'driver';

  const settingsStats = [
    { icon: <TbUserCircle className="text-emerald-600" size={18} />, label: "User",     value: _fullName.split(' ')[0] || 'User' },
    { icon: <TbShield     className="text-blue-500"   size={18} />, label: "Role",     value: role.charAt(0).toUpperCase() + role.slice(1) },
    { icon: <TbCloud      className="text-green-600"  size={18} />, label: "Sync",     value: saveStatus === 'saved' ? 'Saved ✓' : saveStatus === 'saving' ? 'Saving…' : 'Online' },
    { icon: <TbDatabase   className="text-amber-500"  size={18} />, label: "Company",  value: localStorage.getItem('companyName') || '—' },
  ];

  const handleSettingChange = (section, key, value) => {
    setSettings(prev => ({
      ...prev,
      [section]: { ...prev[section], [key]: value }
    }));
    setHasUnsavedChanges(true);
  };

  const handleSaveSettings = () => {
    setSaveStatus('saving');
    // Persist profile fields that belong in localStorage
    const p = settings.profile;
    const full = [p.firstName, p.lastName].filter(Boolean).join(' ');
    if (full)  localStorage.setItem('fullName',    full);
    if (p.email) localStorage.setItem('email',     p.email);
    setTimeout(() => {
      setHasUnsavedChanges(false);
      setSaveStatus('saved');
      setTimeout(() => setSaveStatus(null), 2500);
    }, 600);
  };

  const settingsSections = [
    { id: 'profile', label: 'Profile', icon: <TbUserCircle size={20} /> },
    { id: 'notifications', label: 'Notifications', icon: <TbBellRinging size={20} /> },
    { id: 'security', label: 'Security', icon: <TbShield size={20} /> },
    { id: 'preferences', label: 'Preferences', icon: <TbSettings size={20} /> },
    // { id: 'fleet', label: 'Fleet', icon: <TbTruck size={20} /> },
    { id: 'data', label: 'Data & Storage', icon: <TbDatabase size={20} /> }
  ];

  return (
    <div className="flex flex-col h-screen font-sans select-none
                    bg-gradient-to-br from-emerald-100 via-emerald-50 to-white
                    [background-image:radial-gradient(circle_at_15%_15%,rgba(16,185,129,.25)_0%,transparent_55%),
                                     radial-gradient(circle_at_85%_75%,rgba(5,150,105,.2)_0%,transparent_45%)]">

      {/* Topbar */}
      <Topbar
        logoSrc={Logo}
        appName="OptiGo"
        stats={settingsStats}
        showLiveIndicator={false}
        userInitials={userInitials}
        onHomeClick={() => navigate('/plan')}
        onMapClick={() => navigate('/tracking')}
        onProfileClick={() => navigate('/settings')}
      />

      <div className="flex flex-1 overflow-hidden relative">
        {/* Sidebar */}
        <Sidebar currentTab={currentTab} onTabChange={setCurrentTab} />

        {/* Main content area */}
        <div className="flex flex-1 flex-col md:flex-row overflow-hidden relative">
          
          {/* Settings Navigation (desktop) */}
          <aside className="hidden md:block w-[320px] bg-emerald-50 
                          overflow-y-auto border-emerald-100 z-10">
            <SettingsNavigation 
              sections={settingsSections}
              activeSection={activeSection}
              onSectionChange={setActiveSection}
              hasUnsavedChanges={hasUnsavedChanges}
            />
          </aside>

          {/* Main settings content */}
          <div className="flex-1 flex flex-col overflow-hidden">
            <div className="flex-1 overflow-y-auto p-6 md:p-8">
              {/* Settings content based on active section */}
              {activeSection === 'profile' && (
                <ProfileSettings 
                  settings={settings.profile}
                  onChange={(key, value) => handleSettingChange('profile', key, value)}
                />
              )}
              
              {/* {activeSection === 'notifications' && (
                <NotificationSettings 
                  settings={settings.notifications}
                  onChange={handleNestedSettingChange}
                />
              )} */}
              
              {/* {activeSection === 'security' && (
                <SecuritySettings 
                  settings={settings.security}
                  onChange={(key, value) => handleSettingChange('security', key, value)}
                  showPassword={showPassword}
                  onTogglePassword={() => setShowPassword(!showPassword)}
                />
              )} */}
              
              {/* {activeSection === 'preferences' && (
                <PreferencesSettings 
                  settings={settings.preferences}
                  onChange={(key, value) => handleSettingChange('preferences', key, value)}
                />
              )} */}
              
              {/* {activeSection === 'fleet' && (
                <FleetSettings 
                  settings={settings.fleet}
                  onChange={(key, value) => handleSettingChange('fleet', key, value)}
                />
              )} */}
              
              {activeSection === 'data' && (
                <DataStorageSettings />
              )}
            </div>

            {/* Save bar */}
            {hasUnsavedChanges && (
              <div className="bg-white border-t border-emerald-200 p-4 flex justify-between items-center">
                <div className="flex items-center gap-2 text-amber-600">
                  <FaInfoCircle size={16} />
                  <span className="text-sm font-medium">You have unsaved changes</span>
                </div>
                <div className="flex gap-3">
                  <button
                    onClick={() => setHasUnsavedChanges(false)}
                    className="px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-800 transition-colors"
                  >
                    Discard
                  </button>
                  <button
                    onClick={handleSaveSettings}
                    className="px-6 py-2 bg-emerald-600 text-white text-sm font-medium rounded-lg
                             hover:bg-emerald-700 transition-colors flex items-center gap-2"
                  >
                    <FaSave size={14} />
                    Save Changes
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Mobile floating menu button */}
        <div className="fixed bottom-6 right-6 z-30 md:hidden">
          <button
            onClick={() => setMobileSettingsOpen(true)}
            className="bg-emerald-600 text-white p-4 rounded-full shadow-lg
                     active:scale-95 transition-all hover:bg-emerald-700"
          >
            <TbSettings size={24} />
          </button>
        </div>
      </div>

      {/* Mobile settings drawer */}
      {mobileSettingsOpen && (
        <MobileSettingsDrawer 
          sections={settingsSections}
          activeSection={activeSection}
          onSectionChange={(section) => {
            setActiveSection(section);
            setMobileSettingsOpen(false);
          }}
          onClose={() => setMobileSettingsOpen(false)}
        />
      )}
    </div>
  );
}

/* Settings Navigation Component */
function SettingsNavigation({ sections, activeSection, onSectionChange, hasUnsavedChanges }) {
  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-center gap-3 mb-8">
        <div className="p-3 rounded-xl bg-emerald-600 text-white shadow-lg">
          <TbSettings size={24} />
        </div>
        <div>
          <h2 className="text-xl font-bold text-emerald-800">Settings</h2>
          <p className="text-sm text-emerald-600">Manage your preferences</p>
        </div>
      </div>

      {/* Unsaved changes warning */}
      {hasUnsavedChanges && (
        <div className="mb-6 p-3 bg-amber-50 border border-amber-200 rounded-lg">
          <div className="flex items-center gap-2 text-amber-700">
            <FaExclamationTriangle size={16} />
            <span className="text-sm font-medium">Unsaved changes</span>
          </div>
        </div>
      )}

      {/* Navigation items */}
      <nav className="space-y-2">
        {sections.map((section) => (
          <button
            key={section.id}
            onClick={() => onSectionChange(section.id)}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-left transition-all
                      ${activeSection === section.id
                        ? 'bg-emerald-600 text-white shadow-lg'
                        : 'text-emerald-700 hover:bg-emerald-100'
                      }`}
          >
            {section.icon}
            <span className="font-medium">{section.label}</span>
            <FaChevronRight size={12} className="ml-auto opacity-60" />
          </button>
        ))}
      </nav>
    </div>
  );
}

/* Profile Settings Component */
function ProfileSettings({ settings, onChange }) {
  return (
    <div className="max-w-2xl">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-emerald-800 mb-2">Profile Settings</h1>
        <p className="text-emerald-600">Manage your personal information and account details</p>
      </div>

      {/* Avatar section */}
      <div className="bg-white rounded-xl p-6 border border-emerald-100 shadow-sm mb-6">
        <h3 className="text-lg font-semibold text-emerald-800 mb-4">Profile Picture</h3>
        <div className="flex items-center gap-6">
          <div className="w-20 h-20 bg-emerald-100 rounded-full flex items-center justify-center">
            <TbUserCircle size={40} className="text-emerald-600" />
          </div>
          <div className="flex gap-3">
            <button className="px-4 py-2 bg-emerald-600 text-white text-sm font-medium rounded-lg hover:bg-emerald-700 transition-colors">
              Upload Photo
            </button>
            <button className="px-4 py-2 border border-emerald-300 text-emerald-700 text-sm font-medium rounded-lg hover:bg-emerald-50 transition-colors">
              Remove
            </button>
          </div>
        </div>
      </div>

      {/* Personal information */}
      <div className="bg-white rounded-xl p-6 border border-emerald-100 shadow-sm mb-6">
        <h3 className="text-lg font-semibold text-emerald-800 mb-4">Personal Information</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <FormField 
            label="First Name"
            value={settings.firstName}
            onChange={(value) => onChange('firstName', value)}
          />
          <FormField 
            label="Last Name"
            value={settings.lastName}
            onChange={(value) => onChange('lastName', value)}
          />
          <FormField 
            label="Email Address"
            type="email"
            value={settings.email}
            onChange={(value) => onChange('email', value)}
            className="md:col-span-2"
          />
          <FormField 
            label="Phone Number"
            value={settings.phone}
            onChange={(value) => onChange('phone', value)}
          />
          <FormField 
            label="Role"
            value={settings.role}
            onChange={(value) => onChange('role', value)}
          />
        </div>
      </div>

      {/* Work information */}
      <div className="bg-white rounded-xl p-6 border border-emerald-100 shadow-sm">
        <h3 className="text-lg font-semibold text-emerald-800 mb-4">Work Information</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <FormField 
            label="Department"
            value={settings.department}
            onChange={(value) => onChange('department', value)}
          />
          <FormField 
            label="Employee ID"
            value="EMP-2024-0123"
            disabled
          />
        </div>
      </div>
    </div>
  );
}

/* Notification Settings Component */
function NotificationSettings({ settings, onChange }) {
  return (
    <div className="max-w-2xl">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-emerald-800 mb-2">Notification Settings</h1>
        <p className="text-emerald-600">Choose how you want to be notified about important events</p>
      </div>

      {/* Email notifications */}
      <div className="bg-white rounded-xl p-6 border border-emerald-100 shadow-sm mb-6">
        <h3 className="text-lg font-semibold text-emerald-800 mb-4 flex items-center gap-2">
          <TbBellRinging className="text-emerald-600" />
          Email Notifications
        </h3>
        <div className="space-y-4">
          <ToggleField 
            label="Route Updates"
            description="Get notified when routes are updated or optimized"
            checked={settings.email.routeUpdates}
            onChange={(checked) => onChange('notifications', 'email', 'routeUpdates', checked)}
          />
          <ToggleField 
            label="Fuel Alerts"
            description="Receive alerts about fuel consumption and efficiency"
            checked={settings.email.fuelAlerts}
            onChange={(checked) => onChange('notifications', 'email', 'fuelAlerts', checked)}
          />
          <ToggleField 
            label="Maintenance Reminders"
            description="Get reminders for scheduled vehicle maintenance"
            checked={settings.email.maintenanceReminders}
            onChange={(checked) => onChange('notifications', 'email', 'maintenanceReminders', checked)}
          />
          <ToggleField 
            label="Performance Reports"
            description="Weekly performance and analytics reports"
            checked={settings.email.performanceReports}
            onChange={(checked) => onChange('notifications', 'email', 'performanceReports', checked)}
          />
        </div>
      </div>

      {/* Push notifications */}
      <div className="bg-white rounded-xl p-6 border border-emerald-100 shadow-sm mb-6">
        <h3 className="text-lg font-semibold text-emerald-800 mb-4">Push Notifications</h3>
        <div className="space-y-4">
          <ToggleField 
            label="Route Deviations"
            description="Immediate alerts when drivers deviate from planned routes"
            checked={settings.push.routeDeviations}
            onChange={(checked) => onChange('notifications', 'push', 'routeDeviations', checked)}
          />
          <ToggleField 
            label="Emergency Alerts"
            description="Critical alerts for breakdowns and emergencies"
            checked={settings.push.emergencyAlerts}
            onChange={(checked) => onChange('notifications', 'push', 'emergencyAlerts', checked)}
          />
          <ToggleField 
            label="Traffic Alerts"
            description="Real-time traffic updates affecting your routes"
            checked={settings.push.trafficAlerts}
            onChange={(checked) => onChange('notifications', 'push', 'trafficAlerts', checked)}
          />
        </div>
      </div>

      {/* SMS notifications */}
      <div className="bg-white rounded-xl p-6 border border-emerald-100 shadow-sm">
        <h3 className="text-lg font-semibold text-emerald-800 mb-4">SMS Notifications</h3>
        <div className="space-y-4">
          <ToggleField 
            label="Critical Alerts"
            description="Emergency and critical system alerts via SMS"
            checked={settings.sms.criticalAlerts}
            onChange={(checked) => onChange('notifications', 'sms', 'criticalAlerts', checked)}
          />
          <ToggleField 
            label="Delivery Confirmations"
            description="SMS confirmation when deliveries are completed"
            checked={settings.sms.deliveryConfirmations}
            onChange={(checked) => onChange('notifications', 'sms', 'deliveryConfirmations', checked)}
          />
        </div>
      </div>
    </div>
  );
}

/* Security Settings Component */
function SecuritySettings({ settings, onChange }) {
  return (
    <div className="max-w-2xl">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-emerald-800 mb-2">Security Settings</h1>
        <p className="text-emerald-600">Manage your account security and authentication</p>
      </div>

      {/* Password settings */}
      <div className="bg-white rounded-xl p-6 border border-emerald-100 shadow-sm mb-6">
        <h3 className="text-lg font-semibold text-emerald-800 mb-4">Password</h3>
        <div className="space-y-4">
          <div className="flex items-center justify-between p-4 bg-emerald-50 rounded-lg">
            <div>
              <p className="font-medium text-emerald-800">Change Password</p>
              <p className="text-sm text-emerald-600">Last changed: 2 months ago</p>
            </div>
            <button className="px-4 py-2 bg-emerald-600 text-white text-sm font-medium rounded-lg hover:bg-emerald-700 transition-colors">
              Change
            </button>
          </div>
        </div>
      </div>

      {/* Two-factor authentication */}
      <div className="bg-white rounded-xl p-6 border border-emerald-100 shadow-sm mb-6">
        <h3 className="text-lg font-semibold text-emerald-800 mb-4">Two-Factor Authentication</h3>
        <ToggleField 
          label="Enable 2FA"
          description="Add an extra layer of security to your account"
          checked={settings.twoFactorAuth}
          onChange={(checked) => onChange('twoFactorAuth', checked)}
        />
      </div>

      {/* Session settings */}
      <div className="bg-white rounded-xl p-6 border border-emerald-100 shadow-sm">
        <h3 className="text-lg font-semibold text-emerald-800 mb-4">Session Management</h3>
        <div className="space-y-4">
          <SelectField 
            label="Session Timeout"
            value={settings.sessionTimeout}
            onChange={(value) => onChange('sessionTimeout', parseInt(value))}
            options={[
              { value: 15, label: '15 minutes' },
              { value: 30, label: '30 minutes' },
              { value: 60, label: '1 hour' },
              { value: 120, label: '2 hours' }
            ]}
          />
          <ToggleField 
            label="Login Notifications"
            description="Get notified when someone logs into your account"
            checked={settings.loginNotifications}
            onChange={(checked) => onChange('loginNotifications', checked)}
          />
        </div>
      </div>
    </div>
  );
}

/* Preferences Settings Component */
function PreferencesSettings({ settings, onChange }) {
  return (
    <div className="max-w-2xl">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-emerald-800 mb-2">Preferences</h1>
        <p className="text-emerald-600">Customize your app experience and regional settings</p>
      </div>

      {/* Appearance */}
      <div className="bg-white rounded-xl p-6 border border-emerald-100 shadow-sm mb-6">
        <h3 className="text-lg font-semibold text-emerald-800 mb-4 flex items-center gap-2">
          <TbPalette className="text-emerald-600" />
          Appearance
        </h3>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-3">Theme</label>
            <div className="flex gap-3">
              {[
                { value: 'light', label: 'Light', icon: <TbSun /> },
                { value: 'dark', label: 'Dark', icon: <TbMoon /> },
                { value: 'system', label: 'System', icon: <TbDeviceDesktop /> }
              ].map((theme) => (
                <button
                  key={theme.value}
                  onClick={() => onChange('theme', theme.value)}
                  className={`flex items-center gap-2 px-4 py-3 rounded-lg border-2 transition-all
                            ${settings.theme === theme.value
                              ? 'border-emerald-500 bg-emerald-50 text-emerald-700'
                              : 'border-gray-200 hover:border-emerald-300'
                            }`}
                >
                  {theme.icon}
                  <span className="font-medium">{theme.label}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Regional settings */}
      <div className="bg-white rounded-xl p-6 border border-emerald-100 shadow-sm mb-6">
        <h3 className="text-lg font-semibold text-emerald-800 mb-4">Regional Settings</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <SelectField 
            label="Language"
            value={settings.language}
            onChange={(value) => onChange('language', value)}
            options={[
              { value: 'en', label: 'English' },
              { value: 'es', label: 'Spanish' },
              { value: 'fr', label: 'French' },
              { value: 'de', label: 'German' }
            ]}
          />
          <SelectField 
            label="Timezone"
            value={settings.timezone}
            onChange={(value) => onChange('timezone', value)}
            options={[
              { value: 'Europe/London', label: 'London (GMT)' },
              { value: 'Europe/Paris', label: 'Paris (CET)' },
              { value: 'America/New_York', label: 'New York (EST)' },
              { value: 'America/Los_Angeles', label: 'Los Angeles (PST)' }
            ]}
          />
        </div>
      </div>

      {/* Units */}
      <div className="bg-white rounded-xl p-6 border border-emerald-100 shadow-sm">
        <h3 className="text-lg font-semibold text-emerald-800 mb-4">Units & Formats</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <SelectField 
            label="Distance Unit"
            value={settings.distanceUnit}
            onChange={(value) => onChange('distanceUnit', value)}
            options={[
              { value: 'km', label: 'Kilometers' },
              { value: 'miles', label: 'Miles' }
            ]}
          />
          <SelectField 
            label="Fuel Unit"
            value={settings.fuelUnit}
            onChange={(value) => onChange('fuelUnit', value)}
            options={[
              { value: 'liters', label: 'Liters' },
              { value: 'gallons', label: 'Gallons' }
            ]}
          />
          <SelectField 
            label="Currency"
            value={settings.currency}
            onChange={(value) => onChange('currency', value)}
            options={[
              { value: 'GBP', label: 'British Pound (£)' },
              { value: 'USD', label: 'US Dollar ($)' },
              { value: 'EUR', label: 'Euro (€)' }
            ]}
          />
          <SelectField 
            label="Date Format"
            value={settings.dateFormat}
            onChange={(value) => onChange('dateFormat', value)}
            options={[
              { value: 'DD/MM/YYYY', label: 'DD/MM/YYYY' },
              { value: 'MM/DD/YYYY', label: 'MM/DD/YYYY' },
              { value: 'YYYY-MM-DD', label: 'YYYY-MM-DD' }
            ]}
          />
        </div>
      </div>
    </div>
  );
}

/* Fleet Settings Component */
// function FleetSettings({ settings, onChange }) {
//   return (
//     <div className="max-w-2xl">
//       <div className="mb-8">
//         <h1 className="text-2xl font-bold text-emerald-800 mb-2">Fleet Settings</h1>
//         <p className="text-emerald-600">Configure default settings for your fleet operations</p>
//       </div>

//       <div className="bg-white rounded-xl p-6 border border-emerald-100 shadow-sm">
//         <h3 className="text-lg font-semibold text-emerald-800 mb-4 flex items-center gap-2">
//           <TbTruck className="text-emerald-600" />
//           Vehicle Defaults
//         </h3>
//         <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
//           <FormField 
//             label="Default Fuel Efficiency (km/L)"
//             type="number"
//             value={settings.defaultFuelEfficiency}
//             onChange={(value) => onChange('defaultFuelEfficiency', parseFloat(value))}
//             step="0.1"
//           />
//           <FormField 
//             label="Maintenance Threshold (km)"
//             type="number"
//             value={settings.maintenanceThreshold}
//             onChange={(value) => onChange('maintenanceThreshold', parseInt(value))}
//           />
//           <FormField 
//             label="Speed Limit Buffer (km/h)"
//             type="number"
//             value={settings.speedLimitBuffer}
//             onChange={(value) => onChange('speedLimitBuffer', parseInt(value))}
//           />
//           <FormField 
//             label="Idle Time Alert (minutes)"
//             type="number"
//             value={settings.idleTimeAlert}
//             onChange={(value) => onChange('idleTimeAlert', parseInt(value))}
//           />
//         </div>
//       </div>
//     </div>
//   );
// }

/* Data & Storage Settings Component */
function DataStorageSettings() {
  return (
    <div className="max-w-2xl">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-emerald-800 mb-2">Data & Storage</h1>
        <p className="text-emerald-600">Manage your data, backups, and storage preferences</p>
      </div>

      {/* Data Export */}
      <div className="bg-white rounded-xl p-6 border border-emerald-100 shadow-sm mb-6">
        <h3 className="text-lg font-semibold text-emerald-800 mb-4 flex items-center gap-2">
          <TbDownload className="text-emerald-600" />
          Data Export
        </h3>
        <div className="space-y-4">
          <div className="flex items-center justify-between p-4 bg-emerald-50 rounded-lg">
            <div>
              <p className="font-medium text-emerald-800">Export All Data</p>
              <p className="text-sm text-emerald-600">Download all your fleet data as CSV files</p>
            </div>
            <button className="px-4 py-2 bg-emerald-600 text-white text-sm font-medium rounded-lg hover:bg-emerald-700 transition-colors flex items-center gap-2">
              <FaDownload size={14} />
              Export
            </button>
          </div>
          <div className="flex items-center justify-between p-4 bg-blue-50 rounded-lg">
            <div>
              <p className="font-medium text-blue-800">Route History</p>
              <p className="text-sm text-blue-600">Export route planning and tracking history</p>
            </div>
            <button className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors">
              Export
            </button>
          </div>
          <div className="flex items-center justify-between p-4 bg-amber-50 rounded-lg">
            <div>
              <p className="font-medium text-amber-800">Performance Reports</p>
              <p className="text-sm text-amber-600">Download analytics and performance data</p>
            </div>
            <button className="px-4 py-2 bg-amber-600 text-white text-sm font-medium rounded-lg hover:bg-amber-700 transition-colors">
              Export
            </button>
          </div>
        </div>
      </div>

      {/* Backup Settings */}
      <div className="bg-white rounded-xl p-6 border border-emerald-100 shadow-sm mb-6">
        <h3 className="text-lg font-semibold text-emerald-800 mb-4 flex items-center gap-2">
          <TbCloud className="text-emerald-600" />
          Backup & Sync
        </h3>
        <div className="space-y-4">
          <ToggleField 
            label="Automatic Backups"
            description="Automatically backup your data to secure cloud storage"
            checked={true}
          />
          <ToggleField 
            label="Real-time Sync"
            description="Keep your data synchronized across all devices"
            checked={true}
          />
          <div className="p-4 bg-green-50 rounded-lg">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium text-green-800">Last Backup</p>
                <p className="text-sm text-green-600">Today at 2:30 AM</p>
              </div>
              <div className="flex items-center gap-2 text-green-600">
                <FaCheck size={16} />
                <span className="text-sm font-medium">Up to date</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Storage Usage */}
      <div className="bg-white rounded-xl p-6 border border-emerald-100 shadow-sm mb-6">
        <h3 className="text-lg font-semibold text-emerald-800 mb-4">Storage Usage</h3>
        <div className="space-y-4">
          <StorageBar label="Route Data" used={2.4} total={10} color="emerald" />
          <StorageBar label="Vehicle Tracking" used={1.8} total={10} color="blue" />
          <StorageBar label="Performance Analytics" used={0.9} total={10} color="amber" />
          <StorageBar label="User Data" used={0.3} total={10} color="purple" />
        </div>
        <div className="mt-4 p-4 bg-gray-50 rounded-lg">
          <div className="flex justify-between items-center">
            <span className="font-medium text-gray-700">Total Used</span>
            <span className="font-bold text-gray-900">5.4 GB of 10 GB</span>
          </div>
        </div>
      </div>

      {/* Data Retention */}
      <div className="bg-white rounded-xl p-6 border border-emerald-100 shadow-sm">
        <h3 className="text-lg font-semibold text-emerald-800 mb-4">Data Retention</h3>
        <div className="space-y-4">
          <SelectField 
            label="Route History Retention"
            value="1year"
            options={[
              { value: '3months', label: '3 Months' },
              { value: '6months', label: '6 Months' },
              { value: '1year', label: '1 Year' },
              { value: '2years', label: '2 Years' },
              { value: 'forever', label: 'Keep Forever' }
            ]}
          />
          <div className="p-4 bg-red-50 rounded-lg border border-red-200">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium text-red-800">Delete All Data</p>
                <p className="text-sm text-red-600">Permanently delete all your fleet data</p>
              </div>
              <button className="px-4 py-2 bg-red-600 text-white text-sm font-medium rounded-lg hover:bg-red-700 transition-colors flex items-center gap-2">
                <FaTrash size={14} />
                Delete
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* Helper Components */
function FormField({ label, value, onChange, type = "text", disabled = false, className = "", step, placeholder }) {
  return (
    <div className={className}>
      <label className="block text-sm font-medium text-gray-700 mb-2">{label}</label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange && onChange(e.target.value)}
        disabled={disabled}
        step={step}
        placeholder={placeholder}
        className={`w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 transition-colors
                  ${disabled ? 'bg-gray-100 text-gray-500' : 'bg-white'}`}
      />
    </div>
  );
}

function SelectField({ label, value, onChange, options, className = "" }) {
  return (
    <div className={className}>
      <label className="block text-sm font-medium text-gray-700 mb-2">{label}</label>
      <select
        value={value}
        onChange={(e) => onChange && onChange(e.target.value)}
        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 transition-colors bg-white"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}

function ToggleField({ label, description, checked, onChange }) {
  return (
    <div className="flex items-start justify-between py-3">
      <div className="flex-1">
        <p className="font-medium text-gray-800">{label}</p>
        {description && <p className="text-sm text-gray-600 mt-1">{description}</p>}
      </div>
      <button
        onClick={() => onChange && onChange(!checked)}
        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2
                  ${checked ? 'bg-emerald-600' : 'bg-gray-200'}`}
      >
        <span
          className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform
                    ${checked ? 'translate-x-6' : 'translate-x-1'}`}
        />
      </button>
    </div>
  );
}

function StorageBar({ label, used, total, color }) {
  const percentage = (used / total) * 100;
  const colorClasses = {
    emerald: 'bg-emerald-500',
    blue: 'bg-blue-500',
    amber: 'bg-amber-500',
    purple: 'bg-purple-500'
  };

  return (
    <div>
      <div className="flex justify-between text-sm mb-2">
        <span className="font-medium text-gray-700">{label}</span>
        <span className="text-gray-600">{used} GB of {total} GB</span>
      </div>
      <div className="w-full bg-gray-200 rounded-full h-2">
        <div 
          className={`h-2 rounded-full transition-all duration-300 ${colorClasses[color]}`}
          style={{ width: `${percentage}%` }}
        ></div>
      </div>
    </div>
  );
}

function MobileSettingsDrawer({ sections, activeSection, onSectionChange, onClose }) {
  return (
    <div className="fixed bottom-0 left-0 right-0 bg-emerald-50 rounded-t-3xl p-6 shadow-2xl
                   max-h-[90vh] overflow-y-auto z-50 animate-slideUp">
      <div className="flex flex-col items-center mb-6">
        <div className="w-12 h-1 bg-emerald-200 rounded-full mb-4"></div>
        <div className="flex justify-between items-center w-full">
          <h2 className="text-lg font-bold text-emerald-800">Settings</h2>
          <button onClick={onClose} className="text-emerald-600 p-2 hover:bg-emerald-100 rounded-lg">
            <FaChevronUp />
          </button>
        </div>
      </div>
      
      <div className="space-y-2">
        {sections.map((section) => (
          <button
            key={section.id}
            onClick={() => onSectionChange(section.id)}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-left transition-all
                      ${activeSection === section.id
                        ? 'bg-emerald-600 text-white'
                        : 'text-emerald-700 hover:bg-emerald-100'
                      }`}
          >
            {section.icon}
            <span className="font-medium">{section.label}</span>
            <FaChevronRight size={12} className="ml-auto opacity-60" />
          </button>
        ))}
      </div>
    </div>
  );
}