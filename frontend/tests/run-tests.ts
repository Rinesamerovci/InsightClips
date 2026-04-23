import { runApiTests } from "./api.test";
import { runAnalyticsTests } from "./analytics.test";
import { runClipsTests } from "./clips.test";

async function main(): Promise<void> {
  runClipsTests();
  runAnalyticsTests();
  await runApiTests();
  console.log("Frontend helper and API tests passed.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
