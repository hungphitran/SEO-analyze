/** Commit the running build was made from. Never contains secrets. */
export function getBuildCommit(): string {
  return typeof __BUILD_COMMIT__ === "string" && __BUILD_COMMIT__
    ? __BUILD_COMMIT__
    : "dev";
}
