/** @type {import('tailwindcss').Config} */
export default {
  darkMode: ["class"],
  content: [
    "./index.html",
    "./src/**/*.{vue,js,ts,jsx,tsx}",
    "../../packages/shared/src/**/*.{js,ts}",
  ],
  safelist: [
    "bg-violet-50",
    "bg-violet-100",
    "bg-violet-300",
    "bg-violet-400",
    "bg-cyan-50",
    "bg-amber-50",
    "bg-slate-100",
    "bg-slate-200",
    "bg-orange-50",
    "bg-orange-100",
    "bg-rose-50",
    "bg-rose-100",
    "bg-red-100",
    "bg-sky-50",
    "bg-sky-100",
    "bg-blue-50",
    "bg-blue-100",
    "bg-blue-200",
    "bg-teal-50",
    "bg-emerald-50",
    "bg-indigo-50",
    "bg-indigo-200",
    "bg-indigo-300",
    "bg-green-100",
    "bg-purple-200",
    "bg-purple-300",
    "bg-gray-100",
    "text-violet-700",
    "text-violet-800",
    "text-violet-900",
    "text-violet-950",
    "text-cyan-700",
    "text-amber-700",
    "text-slate-600",
    "text-orange-700",
    "text-orange-800",
    "text-rose-700",
    "text-rose-800",
    "text-red-800",
    "text-sky-700",
    "text-sky-800",
    "text-blue-700",
    "text-blue-800",
    "text-blue-900",
    "text-teal-700",
    "text-emerald-700",
    "text-indigo-700",
    "text-indigo-900",
    "text-green-800",
    "text-purple-900",
    "text-gray-700",
  ],
  theme: {
  	extend: {
  		colors: {
  			border: 'hsl(var(--border))',
  			input: 'hsl(var(--input))',
  			ring: 'hsl(var(--ring))',
  			background: 'hsl(var(--background))',
  			foreground: 'hsl(var(--foreground))',
  			primary: {
  				DEFAULT: 'hsl(var(--primary))',
  				foreground: 'hsl(var(--primary-foreground))'
  			},
  			secondary: {
  				DEFAULT: 'hsl(var(--secondary))',
  				foreground: 'hsl(var(--secondary-foreground))'
  			},
  			destructive: {
  				DEFAULT: 'hsl(var(--destructive))',
  				foreground: 'hsl(var(--destructive-foreground))'
  			},
  			muted: {
  				DEFAULT: 'hsl(var(--muted))',
  				foreground: 'hsl(var(--muted-foreground))'
  			},
  			accent: {
  				DEFAULT: 'hsl(var(--accent))',
  				foreground: 'hsl(var(--accent-foreground))'
  			},
  			card: {
  				DEFAULT: 'hsl(var(--card))',
  				foreground: 'hsl(var(--card-foreground))'
  			},
  			popover: {
  				DEFAULT: 'hsl(var(--popover))',
  				foreground: 'hsl(var(--popover-foreground))'
  			},
  			chart: {
  				'1': 'hsl(var(--chart-1))',
  				'2': 'hsl(var(--chart-2))',
  				'3': 'hsl(var(--chart-3))',
  				'4': 'hsl(var(--chart-4))',
  				'5': 'hsl(var(--chart-5))'
  			}
  		},
  		borderRadius: {
  			lg: 'var(--radius)',
  			md: 'calc(var(--radius) - 2px)',
  			sm: 'calc(var(--radius) - 4px)'
  		}
  	}
  },
  plugins: [require("tailwindcss-animate")],
};
