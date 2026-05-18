/** @type {import('tailwindcss').Config} */
export default {
   content: [
    "./index.html",
    "./src/**/*.{js,jsx,ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        oxi: "#5fa760",       // your brand green
       
        dark: {
          bg: '#111827',      // gray-900
          surface: '#1f2937', // gray-800
          border: '#374151',  // gray-700
        }
      
      },
    },
  },
  plugins: [],
}

