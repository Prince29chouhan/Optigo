// Topbar.jsx - Reusable topbar component with logo, stats, and user controls
import { 
  FaClock, 
  FaGasPump, 
  FaLeaf,
  FaMapMarkedAlt,
  FaMoon,
  FaSun
} from "react-icons/fa";
import { TbRoad, TbHome } from "react-icons/tb";

/**
 * Reusable topbar component with logo, optional stats, and user controls
 * @param {Object} props - Component props
 * @param {string} props.logoSrc - Source URL for the logo image
 * @param {string} props.appName - Name of the application to display next to logo
 * @param {Array} props.stats - Optional array of stats to display in the center of the topbar
 * @param {boolean} props.showLiveIndicator - Whether to show the live indicator (default: true)
 * @param {string} props.userInitials - User initials to show in the avatar circle
 * @param {boolean} props.isDarkMode - Current dark mode state
 * @param {Function} props.onDarkModeToggle - Function to handle dark mode toggle
 * @param {Function} props.onHomeClick - Function to handle home button click
 * @param {Function} props.onMapClick - Function to handle map button click
 * @param {Function} props.onProfileClick - Function to handle profile click
 * @returns {JSX.Element}
 */
export default function Topbar({ 
  logoSrc, 
  appName, 
  stats = [], 
  showLiveIndicator = true,
  userInitials,
  isDarkMode = false,
  onDarkModeToggle,
  onHomeClick,
  onMapClick,
  onProfileClick
}) {
  return (
    <div className={`h-16 border-b flex items-center justify-between px-6 transition-colors duration-200 ${
      isDarkMode 
        ? 'border-emerald-800 bg-emerald-900/80 backdrop-blur-md' 
        : 'border-emerald-100 bg-emerald-50/80 backdrop-blur-md'
    }`}>
      {/* Logo and app name */}
      <div className="flex items-center gap-3">
        {logoSrc && (
          <div className="">
            <img src={logoSrc} alt={`${appName} logo`} className="h-14 w-14 object-contain" />
          </div>
        )}
        {appName && (
          <h1 className={`text-xl font-bold transition-colors duration-200 ${
            isDarkMode ? 'text-emerald-100' : 'text-emerald-800'
          }`}>
            {appName}
          </h1>
        )}
      </div>
      
      {/* Stats in the middle of the top bar */}
      {stats.length > 0 && (
        <div className="hidden md:flex items-center gap-3 mx-4 flex-1 justify-center">
          {stats.map((stat, index) => (
            <TopBarStat 
              key={index}
              icon={stat.icon}
              label={stat.label}
              value={stat.value}
              isDarkMode={isDarkMode}
            />
          ))}
        </div>
      )}
      
      {/* Right side controls */}
      <div className="flex items-center gap-4">
        {showLiveIndicator && (
          <div className="hidden md:flex items-center gap-2 text-xs whitespace-nowrap mr-2">
            <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></div>
            <span className={`transition-colors duration-200 ${
              isDarkMode ? 'text-emerald-300' : 'text-emerald-700'
            }`}>
              Live
            </span>
          </div>
        )}
        
        {/* Dark mode toggle button */}
        <button 
          className={`p-2 rounded-lg transition-all duration-200 ${
            isDarkMode 
              ? 'text-emerald-300 hover:text-emerald-200 hover:bg-emerald-800/50' 
              : 'text-emerald-700 hover:text-emerald-600 hover:bg-emerald-100/50'
          }`}
          onClick={onDarkModeToggle}
          title={isDarkMode ? 'Switch to light mode' : 'Switch to dark mode'}
        >
          {isDarkMode ? <FaSun size={18} /> : <FaMoon size={18} />}
        </button>
        
        <button 
          className={`transition-colors duration-200 ${
            isDarkMode 
              ? 'text-emerald-300 hover:text-emerald-200' 
              : 'text-emerald-700 hover:text-emerald-600'
          }`}
          onClick={onHomeClick}
        >
          <TbHome size={20} />
        </button>
        
        <button 
          className={`transition-colors duration-200 ${
            isDarkMode 
              ? 'text-emerald-300 hover:text-emerald-200' 
              : 'text-emerald-700 hover:text-emerald-600'
          }`}
          onClick={onMapClick}
        >
          <FaMapMarkedAlt size={18} />
        </button>
        
        {userInitials && (
          <div 
            className={`h-8 w-8 rounded-full flex items-center justify-center font-medium cursor-pointer transition-colors duration-200 ${
              isDarkMode 
                ? 'bg-emerald-700 text-emerald-100 hover:bg-emerald-600' 
                : 'bg-emerald-600 text-white hover:bg-emerald-700'
            }`}
            onClick={onProfileClick}
          >
            {userInitials}
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Stat component for the topbar
 */
export function TopBarStat({ icon, label, value, isDarkMode = false }) {
  return (
    <div className={`flex items-center gap-2 rounded-lg px-3 py-1.5 shadow-sm border min-w-[100px] transition-colors duration-200 ${
      isDarkMode 
        ? 'bg-emerald-800/70 border-emerald-700' 
        : 'bg-white/70 border-emerald-100'
    }`}>
      <span className={`transition-colors duration-200 ${
        isDarkMode ? 'text-emerald-300' : 'text-emerald-700'
      }`}>
        {icon}
      </span>
      <div className="flex flex-col">
        <span className={`text-xs transition-colors duration-200 ${
          isDarkMode ? 'text-emerald-300' : 'text-emerald-700'
        }`}>
          {label}
        </span>
        <span className={`text-sm font-bold transition-colors duration-200 ${
          isDarkMode ? 'text-emerald-100' : 'text-emerald-900'
        }`}>
          {value}
        </span>
      </div>
    </div>
  );
}