// Mock for monaco-editor
export const editor = {
  setTheme: () => {},
  create: () => ({
    dispose: () => {},
    getValue: () => "",
    setValue: () => {},
  }),
  createModel: () => ({
    dispose: () => {},
    getValue: () => "",
    setValue: () => {},
  }),
  setModelLanguage: () => {},
};

export default { editor };
