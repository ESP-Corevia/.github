const fs = require('node:fs')
const path = require('node:path')
const { Octokit } = require('@octokit/rest')

const github = new Octokit({
  auth: process.env.GITHUB_TOKEN,
})

const org = 'ESP-Corevia'
const repos = ['CoreApp', 'corevia_mobile', 'rag-communication-service', 'Document', 'T-LAW-901']

const activity = {}

/* -------------------------------------------------------------
   FETCH LATEST COMMIT
------------------------------------------------------------- */
async function getLatestCommit(repo) {
  try {
    const commits = await github.rest.repos.listCommits({
      owner: org,
      repo,
      per_page: 1,
    })

    if (commits.data.length === 0) return '0'

    const c = commits.data[0]
    const msg = c.commit?.message?.split('\n')[0] || 'No message'
    const date = c.commit?.author?.date?.split('T')[0] || ''

    return `${msg}${date ? ` — ${date}` : ''}`
  } catch {
    return '0'
  }
}

/* -------------------------------------------------------------
   FETCH PRs (open + closed, excluding drafts)
------------------------------------------------------------- */
async function getPRs(repo) {
  try {
    const open = await github.rest.pulls.list({
      owner: org,
      repo,
      state: 'open',
      per_page: 20,
    })

    const closed = await github.rest.pulls.list({
      owner: org,
      repo,
      state: 'closed',
      per_page: 20,
    })

    const lastOpen = open.data.filter((p) => !p.draft)[0]
    const lastClosed = closed.data.filter((p) => !p.draft)[0]

    return {
      lastOpenPR: lastOpen
        ? `[#${lastOpen.number} - ${lastOpen.title}](${lastOpen.html_url})`
        : '0',
      lastClosedPR: lastClosed
        ? `[#${lastClosed.number} - ${lastClosed.title}](${lastClosed.html_url})`
        : '0',
    }
  } catch {
    return { lastOpenPR: '0', lastClosedPR: '0' }
  }
}

/* -------------------------------------------------------------
   FETCH Issues (open + closed)
------------------------------------------------------------- */
async function getIssues(repo) {
  try {
    const openIssues = await github.rest.issues.listForRepo({
      owner: org,
      repo,
      state: 'open',
      per_page: 20,
    })

    const closedIssues = await github.rest.issues.listForRepo({
      owner: org,
      repo,
      state: 'closed',
      per_page: 20,
    })

    const lastOpen = openIssues.data.find((i) => !i.pull_request)
    const lastClosed = closedIssues.data.find((i) => !i.pull_request)

    return {
      lastOpenIssue: lastOpen
        ? `[#${lastOpen.number} - ${lastOpen.title}](${lastOpen.html_url})`
        : '0',
      lastClosedIssue: lastClosed
        ? `[#${lastClosed.number} - ${lastClosed.title}](${lastClosed.html_url})`
        : '0',
    }
  } catch {
    return { lastOpenIssue: '0', lastClosedIssue: '0' }
  }
}

/* -------------------------------------------------------------
   FETCH STARS + CONTRIBUTORS + BASE METADATA
------------------------------------------------------------- */
async function getRepoStats(repo) {
  try {
    const repoData = await github.rest.repos.get({
      owner: org,
      repo,
    })

    const contributors = await github.paginate(github.rest.repos.listContributors, {
      owner: org,
      repo,
      per_page: 100,
    })

    return {
      stars: repoData.data.stargazers_count || 0,
      contributors: contributors.length,
      openIssuesCount: repoData.data.open_issues_count || 0,
    }
  } catch {
    return { stars: 0, contributors: 0, openIssuesCount: 0 }
  }
}

/* -------------------------------------------------------------
   MAIN FETCH FUNCTION PER REPO
------------------------------------------------------------- */
async function fetchRepoActivity(repo) {
  console.log(`⏳ Fetching: ${repo}`)

  const latestCommit = await getLatestCommit(repo)
  const prs = await getPRs(repo)
  const issues = await getIssues(repo)
  const stats = await getRepoStats(repo)

  activity[repo] = {
    latestCommit,
    lastOpenPR: prs.lastOpenPR,
    lastClosedPR: prs.lastClosedPR,
    lastOpenIssue: issues.lastOpenIssue,
    lastClosedIssue: issues.lastClosedIssue,
    stars: stats.stars,
    contributors: stats.contributors,
    openIssues: stats.openIssuesCount,
  }

  console.log(`✅ Done: ${repo}`)
}

/* -------------------------------------------------------------
   REPLACE BETWEEN MARKERS
------------------------------------------------------------- */
function replaceBetween(content, marker, value) {
  const start = `<!-- ${marker} -->`
  const end = `<!-- /${marker} -->`
  const regex = new RegExp(`${start}[\\s\\S]*?${end}`, 'm')
  return content.replace(regex, `${start}${value}${end}`)
}

/* -------------------------------------------------------------
   MAIN SCRIPT
------------------------------------------------------------- */
async function main() {
  console.log('🚀 Updating README...')

  await Promise.all(repos.map(fetchRepoActivity))

  // Org-wide stats
  const orgRepos = await github.paginate(github.rest.repos.listForOrg, {
    org,
    type: 'public',
    per_page: 100,
  })

  const totalRepos = orgRepos.length
  const totalStars = orgRepos.reduce((sum, r) => sum + (r.stargazers_count || 0), 0)

  // Load README
  const readmePath = path.join(process.cwd(), 'profile/README.md')
  let readme = fs.readFileSync(readmePath, 'utf8')

  const now = new Date().toISOString().split('T')[0]

  /* -------------------------------------------------------------
     UPDATE GLOBAL MARKERS
  ------------------------------------------------------------- */
  readme = readme.replace(/<!-- LAST_UPDATED:[^>]+ -->/, `<!-- LAST_UPDATED:${now} -->`)

  readme = replaceBetween(readme, 'LAST_UPDATED_FOOTER', now)
  readme = readme.replace(/(\| 📦 Total Repositories\s+\|\s+)\d+/, `$1${totalRepos}`)
  readme = replaceBetween(readme, 'TOTAL_STARS', totalStars)

  /* -------------------------------------------------------------
     UPDATE EACH PROJECT MARKERS
  ------------------------------------------------------------- */

  function applyProjectMarkers(prefix, repoName) {
    const repo = activity[repoName]

    readme = replaceBetween(readme, `${prefix}_LAST_COMMIT`, repo.latestCommit)
    readme = replaceBetween(readme, `${prefix}_LAST_OPEN_PR`, repo.lastOpenPR)
    readme = replaceBetween(readme, `${prefix}_LAST_CLOSED_PR`, repo.lastClosedPR)
    readme = replaceBetween(readme, `${prefix}_LAST_OPEN_ISSUE`, repo.lastOpenIssue)
    readme = replaceBetween(readme, `${prefix}_LAST_CLOSED_ISSUE`, repo.lastClosedIssue)
    readme = replaceBetween(readme, `${prefix}_STARS`, repo.stars)
    readme = replaceBetween(readme, `${prefix}_CONTRIB`, repo.contributors)
  }

  applyProjectMarkers('COREAPP', 'CoreApp')
  applyProjectMarkers('MOBILE', 'corevia_mobile')
  applyProjectMarkers('RAG', 'rag-communication-service')

  // Write back
  fs.writeFileSync(readmePath, readme)
  console.log('🎉 README updated successfully!')
}

main().catch((err) => {
  console.error('❌ Script failed:', err)
  process.exit(1)
})
