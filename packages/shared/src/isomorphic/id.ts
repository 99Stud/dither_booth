export const createDeviceId = () => {
  if (
    typeof crypto !== "undefined" &&
    typeof crypto.randomUUID === "function"
  ) {
    return crypto.randomUUID();
  }

  return `device-${Math.random().toString(36).slice(2, 10)}`;
};
