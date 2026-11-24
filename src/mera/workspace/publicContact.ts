export const validPublicContact = (value: string) =>
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim()) ||
  (/^\+?[\d\s().-]+$/.test(value.trim()) &&
    value.replace(/\D/g, "").length >= 7);
