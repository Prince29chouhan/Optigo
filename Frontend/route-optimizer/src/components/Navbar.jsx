// src/components/Navbar.jsx
import { useState, useEffect, useRef } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import logo from "../assets/optigo-logo.png";  // your OptiGo PNG

// Navigation items with icons
const NAV_ITEMS = [
  {
    to: "/plan",
    label: "Plan Route",
    icon: (
      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M9 20L3 17V4L9 7M9 20V7M9 20L15 17M9 7L15 4M15 4L21 7L15 10M15 17V10M15 17L21 14V10" 
              stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    )
  },
  {
    to: "/tracking",
    label: "Live Tracking",
    icon: (
      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M12 19L12 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
        <path d="M19 12L5 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
        <path d="M12 19C13.6569 19 15 17.6569 15 16C15 14.3431 13.6569 13 12 13C10.3431 13 9 14.3431 9 16C9 17.6569 10.3431 19 12 19Z"
              stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
      </svg>
    )
  },
  {
    to: "/emissions",
    label: "Emissions",
    icon: (
      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M4.18898 14.8878C3.41041 13.4271 3.0011 12.6968 3.00005 12.0005C2.99899 11.3043 3.4067 10.5732 4.18212 9.1109C4.94311 7.66733 5.32361 6.94555 5.90191 6.47273C6.48021 5.99992 7.26557 5.83471 8.83627 5.50429C10.4285 5.16919 11.2246 5.00164 12.0005 5.00164C12.7765 5.00164 13.5725 5.16919 15.1648 5.50429C16.7355 5.83471 17.5208 5.99992 18.0991 6.47273C18.6774 6.94555 19.0579 7.66733 19.8189 9.1109C20.5943 10.5732 20.9021 11.3043 20.901 12.0005C20.9 12.6968 20.4906 13.4271 19.7121 14.8878C18.9412 16.3352 18.5557 17.0589 17.9746 17.533C17.3935 18.0072 16.6049 18.1732 15.0278 18.5052C13.4289 18.8422 12.6295 19.0108 11.851 19.0098C11.0725 19.0088 10.2736 18.8385 8.67414 18.4978C7.10072 18.1626 6.31401 17.995 5.73616 17.5203C5.15831 17.0457 4.78169 16.321 4.18898 14.8878Z" 
              stroke="currentColor" strokeWidth="1.5"/>
        <path d="M15 12C15 13.6569 13.6569 15 12 15C10.3431 15 9 13.6569 9 12C9 10.3431 10.3431 9 12 9C13.6569 9 15 10.3431 15 12Z" 
              stroke="currentColor" strokeWidth="1.5"/>
      </svg>
    )
  }
];

export default function Navbar() {
  const { user, logout } = useAuth();
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const navRef = useRef(null);
  const indicatorRef = useRef(null);
  const prevPathRef = useRef(pathname);

  // Handle scroll events
  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  // Sliding indicator for desktop nav
  useEffect(() => {
    const positionIndicator = () => {
      if (!navRef.current || !indicatorRef.current) return;
      const activeLink = navRef.current.querySelector(`[data-path="${pathname}"]`);
      if (!activeLink) return;

      const navRect = navRef.current.getBoundingClientRect();
      const linkRect = activeLink.getBoundingClientRect();
      const left = linkRect.left - navRect.left;
      const width = linkRect.width;

      // Initial render: no transition
      if (!indicatorRef.current.style.width || prevPathRef.current === pathname) {
        indicatorRef.current.style.transition = "none";
        indicatorRef.current.style.width = `${width}px`;
        indicatorRef.current.style.transform = `translateX(${left}px)`;
        indicatorRef.current.getBoundingClientRect();
      }
      // Subsequent
      indicatorRef.current.style.transition = "transform 300ms ease-out, width 300ms ease-out";
      indicatorRef.current.style.width = `${width}px`;
      indicatorRef.current.style.transform = `translateX(${left}px)`;
      prevPathRef.current = pathname;
    };

    positionIndicator();
    window.addEventListener("resize", positionIndicator);
    return () => window.removeEventListener("resize", positionIndicator);
  }, [pathname]);

  const handleLogout = () => {
    logout();
    navigate("/");
    setOpen(false);
  };

  return (
    <>
      <header
        className={`fixed top-0 inset-x-0 z-50 transition-all duration-300 ease-in-out ${
          scrolled
            ? "bg-[#45BC53]/95 backdrop-blur-sm shadow-lg"
            : "bg-[#45BC53] shadow-md"
        }`}
      >
        <div className="max-w-7xl mx-auto">
          <nav className="flex items-center justify-between px-4 py-3">
            {/* Logo */}
            <Link to="/" className="flex items-center">
              <img src={logo} alt="OptiGo" className="h-12 \\" />
            </Link>

            {/* Desktop nav */}
            <div className="hidden md:block">
              <div className="relative" ref={navRef}>
                <div
                  ref={indicatorRef}
                  className="absolute bg-white/15 rounded-md"
                  style={{ height: "80%", top: "10%", zIndex: 0 }}
                />
                <div className="flex relative">
                  {NAV_ITEMS.map(item => (
                    <Link
                      key={item.to}
                      to={item.to}
                      data-path={item.to}
                      className={`px-5 py-2 flex items-center gap-2 text-sm font-medium transition-colors duration-200 relative z-10 ${
                        pathname === item.to
                          ? 'text-white'
                          : 'text-white/80 hover:text-white'
                      }`}
                    >
                      <span className={`transition-colors duration-200 ${
                        pathname === item.to ? 'text-white' : 'text-white/80'
                      }`}>{item.icon}</span>
                      {item.label}
                    </Link>
                  ))}
                </div>
              </div>
            </div>

            {/* User controls */}
            <div className="hidden md:flex items-center">
              {user && (
                <button
                  onClick={handleLogout}
                  className="ml-5 px-4 py-1.5 bg-white/10 hover:bg-white/20 rounded-md text-white text-sm transition-all duration-200 hover:shadow-lg"
                >
                  Logout
                </button>
              )}
            </div>

            {/* Mobile toggle */}
            <div className="md:hidden">
              <button
                onClick={() => setOpen(!open)}
                className="p-2 focus:outline-none focus:ring-1 focus:ring-white/30 rounded"
                aria-label="Toggle menu"
              >
                <div className="w-5 h-4 flex flex-col justify-between">
                  <span className={`h-0.5 bg-white rounded-full transition-all duration-300 transform origin-left ${
                    open ? 'rotate-45 w-6' : 'w-5'
                  }`} />
                  <span className={`h-0.5 bg-white rounded-full transition-all duration-300 ${
                    open ? 'opacity-0 translate-x-3' : 'opacity-100 w-3 ml-auto'
                  }`} />
                  <span className={`h-0.5 bg-white rounded-full transition-all duration-300 transform origin-left ${
                    open ? '-rotate-45 w-6' : 'w-5'
                  }`} />
                </div>
              </button>
            </div>
          </nav>

          {/* Mobile menu */}
          <div className={`md:hidden overflow-hidden transition-all duration-300 ease-in-out ${
            open ? 'max-h-64 border-t border-white/10' : 'max-h-0'
          }`}>
            <div className="px-3 pt-2 pb-3 space-y-1 bg-[#45BC53]">
              {NAV_ITEMS.map((item, idx) => (
                <Link
                  key={item.to}
                  to={item.to}
                  onClick={() => setOpen(false)}
                  className={`flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-all duration-200 transform ${
                    open ? 'translate-x-0' : '-translate-x-5'
                  } ${
                    pathname === item.to
                      ? 'bg-white/20 text-white'
                      : 'text-white/80 hover:bg-white/10 hover:text-white'
                  }`}
                  style={{ transitionDelay: `${idx * 50}ms` }}
                >
                  <span className={pathname === item.to ? 'text-white' : 'text-white/70'}>
                    {item.icon}
                  </span>
                  {item.label}
                </Link>
              ))}

              {user && (
                <button
                  onClick={handleLogout}
                  className="w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium text-white/80 hover:bg-red-600/20 hover:text-white transition-all duration-200"
                  style={{ transitionDelay: `${NAV_ITEMS.length * 50}ms` }}
                >
                  {/* logout icon can be added here if desired */}
                  Logout
                </button>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Spacer so content sits below fixed header */}
      <div className="h-16 md:h-[64px]" />
    </>
  );
}