const { fontFamily } = require("tailwindcss/defaultTheme");

module.exports = {
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        // Light mode
        lightBg: "#f5f0e6",  
        lightText: "#1a1a1a",  
        lightAccent: {
          DEFAULT: "#e6dccf", 
          light: "#faf6f0", 
          dark: "#d9cbb8",  
        },

        // Dark mode
        darkBg: "#0a1a2f",    
        darkText: "#f5f5f5",  
        darkAccent: {
          DEFAULT: "#132b47",  
          light: "#1c3b63", 
          dark: "#0d2138", 
        },
      },
      fontFamily: {
        sans: ["var(--font-poppins)", ...fontFamily.sans],
        serif: ["var(--font-playfair)", ...fontFamily.serif],
      },
    },
  },
  plugins: [],
};
