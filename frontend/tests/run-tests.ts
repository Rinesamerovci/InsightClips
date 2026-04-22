import { runAnalyticsTests } from "./analytics.test";
import { runClipsTests } from "./clips.test";

runClipsTests();
runAnalyticsTests();

console.log("Frontend helper tests passed.");
