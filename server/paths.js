import { resolve } from "node:path";

// Store records and output survive application updates under ProgramData on Windows.
export const dataPath = (...parts) =>
  resolve(process.env.POS_DATA_DIR || ".", ...parts);
export const printOutputPath = (...parts) => dataPath("print-output", ...parts);
export const backupPath = (...parts) => dataPath("backups", ...parts);
export const pythonExecutable = () => process.env.PRINT_PYTHON || "python";
