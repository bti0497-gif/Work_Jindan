export default {
    content: [
      "./index.html",
      "./index.tsx",
      "./App.tsx",
      "./components/**/*.{ts,tsx}",
      "./hooks/**/*.{ts,tsx}",
      "./services/**/*.{ts,tsx}",
    ],
    theme: {
      extend: {},
    },
    plugins: [
      require('@tailwindcss/forms'),
      require('@tailwindcss/container-queries'),
    ],
  }
