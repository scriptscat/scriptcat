// Define / mock your globals here
global.fetch = () => {
  return Promise.reject(new Error("not implemented"));
};
