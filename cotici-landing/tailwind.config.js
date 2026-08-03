/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          DEFAULT: '#009E60',
          dark: '#007A4D',
          light: '#E6F7F0',
        },
        accent: {
          DEFAULT: '#FF7800',
          light: '#FFF4E8',
          glow: '#FFE4B8',
        },
      },
      fontFamily: {
        display: ['"Space Grotesk"', 'system-ui', 'sans-serif'],
        body: ['Outfit', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        card: '0 8px 30px rgba(6, 95, 70, 0.08)',
        phone: '0 25px 50px -12px rgba(17, 24, 39, 0.25)',
        glow: '0 0 0 1px rgba(0, 158, 96, 0.08), 0 12px 40px rgba(0, 158, 96, 0.12)',
        'glow-lg': '0 0 0 1px rgba(0, 158, 96, 0.06), 0 24px 60px rgba(0, 158, 96, 0.15)',
      },
      backgroundImage: {
        'hero-glow': 'radial-gradient(ellipse 80% 60% at 50% 100%, #FFE4B8 0%, transparent 70%)',
        'mesh-light':
          'radial-gradient(at 40% 20%, rgba(0, 158, 96, 0.12) 0px, transparent 50%), radial-gradient(at 80% 0%, rgba(255, 120, 0, 0.08) 0px, transparent 50%), radial-gradient(at 0% 50%, rgba(0, 158, 96, 0.08) 0px, transparent 50%)',
      },
      animation: {
        'orb-drift': 'orb-drift 18s ease-in-out infinite',
        'orb-drift-reverse': 'orb-drift-reverse 22s ease-in-out infinite',
        'float-phone': 'float-phone 6s ease-in-out infinite',
      },
    },
  },
  plugins: [],
};
