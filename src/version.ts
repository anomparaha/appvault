import pkg from "../package.json";

/**
 * Single source of truth for the application version in the frontend.
 * Automatically synchronizes with package.json.
 */
export const APP_VERSION: string = pkg.version;
