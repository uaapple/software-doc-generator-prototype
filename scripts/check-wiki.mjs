import { validateWikiSite } from "../src/wiki/site-service.js";

const result = await validateWikiSite();

if (!result.ok) {
  console.error("Wiki validation failed.");
  for (const error of result.errors) {
    console.error(`- ${error}`);
  }
  process.exitCode = 1;
} else {
  console.log("Wiki validation passed.");
}
