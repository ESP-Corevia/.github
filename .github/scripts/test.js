const fs = require("fs");
const { Octokit } = require("@octokit/rest");
const path = require("path");

const github = new Octokit({
  auth: process.env.GITHUB_TOKEN,
});

const org = "ESP-Corevia";
const repos = [
  "CoreApp",
  "corevia_mobile",
  "rag-communication-service",
  "Document",
  "T-LAW-901",
];

const activity = {};

async function fetchRepoActivity(repo) {
  try {
    // Issues
    const { data: issues } = await github.rest.issues.listForRepo({
      owner: org,
      repo,
      state: "all",
      sort: "created",
      direction: "desc",
      per_page: 10,
    });

    const latestIssue = issues.find((i) => !i.pull_request) || null;

    // PRs
    const { data: prs } = await github.rest.pulls.list({
      owner: org,
      repo,
      state: "all",
      sort: "created",
      direction: "desc",
      per_page: 1,
    });

    // Repo metadata
    const { data: repoData } = await github.rest.repos.get({
      owner: org,
      repo,
    });

    activity[repo] = {
      latestIssue: latestIssue
        ? {
            number: latestIssue.number,
            title:
              latestIssue.title.length > 50
                ? latestIssue.title.substring(0, 50) + "..."
                : latestIssue.title,
            url: latestIssue.html_url,
          }
        : null,
      latestPR: prs[0]
        ? {
            number: prs[0].number,
            title:
              prs[0].title.length > 50
                ? prs[0].title.substring(0, 50) + "..."
                : prs[0].title,
            url: prs[0].html_url,
          }
        : null,
      openIssues: repoData.open_issues_count,
    };

    console.log(`Fetched: ${repo}`);
  } catch (err) {
    console.log(`Error fetching ${repo}: ${err.message}`);
    activity[repo] = {
      latestIssue: null,
      latestPR: null,
      openIssues: 0,
    };
  }
}

async function main() {
  console.log("Fetching repository activity...");

  await Promise.all(repos.map(fetchRepoActivity));

  const orgRepos = await github.paginate(github.rest.repos.listForOrg, {
    org,
    type: "public",
    per_page: 100,
  });

  const totalRepos = orgRepos.length;

  const readmePath = path.join(process.cwd(), "profile/README.md");

  let readme = fs.readFileSync(readmePath, "utf8");

  function replaceBetween(content, marker, replacement) {
    const start = `<!-- ${marker} -->`;
    const end = `<!-- /${marker} -->`;
    const regex = new RegExp(`${start}[\\s\\S]*?${end}`, "m");
    return content.replace(regex, `${start}${replacement}${end}`);
  }

  // CoreApp
  readme = replaceBetween(
    readme,
    "COREAPP_LATEST_ISSUE",
    activity.CoreApp?.latestIssue
      ? `[#${activity.CoreApp.latestIssue.number} - ${activity.CoreApp.latestIssue.title}](${activity.CoreApp.latestIssue.url})`
      : "_No issues yet_"
  );

  readme = replaceBetween(
    readme,
    "COREAPP_LATEST_PR",
    activity.CoreApp?.latestPR
      ? `[#${activity.CoreApp.latestPR.number} - ${activity.CoreApp.latestPR.title}](${activity.CoreApp.latestPR.url})`
      : "_No PRs yet_"
  );

  // Mobile
  readme = replaceBetween(
    readme,
    "MOBILE_LATEST_ISSUE",
    activity.corevia_mobile?.latestIssue
      ? `[#${activity.corevia_mobile.latestIssue.number} - ${activity.corevia_mobile.latestIssue.title}](${activity.corevia_mobile.latestIssue.url})`
      : "_No issues yet_"
  );

  readme = replaceBetween(
    readme,
    "MOBILE_OPEN_ISSUES",
    `**${activity.corevia_mobile?.openIssues ?? 0}**`
  );

  // Document
  readme = replaceBetween(
    readme,
    "DOC_LATEST_ISSUE",
    activity.Document?.latestIssue
      ? `[#${activity.Document.latestIssue.number} - ${activity.Document.latestIssue.title}](${activity.Document.latestIssue.url})`
      : "_No issues yet_"
  );

  // Repo count updates
  readme = readme.replace(
    /Repositories-\d+-blue/,
    `Repositories-${totalRepos}-blue`
  );

  readme = readme.replace(
    /\| 📦 Total Repositories\s+\|\s+\d+/,
    `| 📦 Total Repositories  | ${totalRepos}`
  );

  // Update LAST_UPDATED
  const today = new Date().toISOString().split("T")[0];
  readme = readme.replace(
    /<!-- LAST_UPDATED:[^>]+ -->/,
    `<!-- LAST_UPDATED:${today} -->`
  );

  fs.writeFileSync(readmePath, readme);
  console.log("README updated successfully!");
}

main();
