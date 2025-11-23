import { defineConfig, presetWind3 } from "unocss";

export default defineConfig({
  content: {
    filesystem: ["./src/**/*.{html,js,ts,jsx,tsx}"],
  },
  presets: [
    presetWind3({
      dark: "class",
      prefix: "tw-",
    }),
  ],
});
