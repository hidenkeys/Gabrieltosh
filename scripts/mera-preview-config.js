// Configuration only: a preview instance can never select an arbitrary database directory.
export function meraPreviewConfig(env = process.env) {
  if (env.NODE_ENV === "production")
    throw new Error("Mera demo is not a production launcher.");
  const instance = env.MERA_PREVIEW_INSTANCE;
  if (
    instance !== undefined &&
    (typeof instance !== "string" ||
      instance.length > 40 ||
      !/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/.test(instance))
  )
    throw new Error(
      "MERA_PREVIEW_INSTANCE must be a lowercase slug of at most 40 characters.",
    );
  function port(name, fallback) {
    const value = env[name];
    if (value === undefined) return fallback;
    if (
      typeof value !== "string" ||
      !/^[0-9]+$/.test(value) ||
      !Number.isSafeInteger(Number(value)) ||
      Number(value) < 1 ||
      Number(value) > 65535
    )
      throw new Error(`${name} must be an integer from 1 to 65535.`);
    return Number(value);
  }
  const webPort = port("MERA_PREVIEW_PORT", 3003),
    dbPort = port("MERA_PREVIEW_DB_PORT", 55441);
  if (webPort === dbPort)
    throw new Error("Preview web and database ports must be distinct.");
  return {
    instance: instance || "default",
    databaseDir: instance
      ? `data/mera-demo-${instance}-db`
      : "data/mera-demo-db",
    webPort,
    dbPort,
    host: "127.0.0.1",
    url: `http://127.0.0.1:${webPort}/mera`,
  };
}
