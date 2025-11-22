import { defineConfig, presetWind3 } from "unocss";

export default defineConfig({
  extractors: [
    {
      name: "prefix-tw",
      extract({ code }) {
        return Array.from(code.matchAll(/tw-[\w-:/]+/g)).map((i) => i[0]);
      },
    },
  ],
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
