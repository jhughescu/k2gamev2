const { execSync } = require("child_process");

const message =
  process.argv.slice(2).join(" ") || `Update ${new Date().toLocaleString()}`;

function run(cmd) {
  console.log(`\n> ${cmd}`);
  execSync(cmd, { stdio: "inherit" });
}

try {
  // Don't try to commit if nothing has changed.
  const status = execSync("git status --porcelain").toString().trim();

  if (!status) {
    console.log("Nothing to commit.");
    process.exit(0);
  }

  run("git add .");
  run(`git commit -m "${message}"`);
  run("git push");

  console.log("\nDone!");
} catch (err) {
  console.error("\nGit command failed.");
  process.exit(1);
}
