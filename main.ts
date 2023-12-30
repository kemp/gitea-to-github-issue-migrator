import {load} from "https://deno.land/std@0.210.0/dotenv/mod.ts";

interface GiteaIssue {
    title: string;
    html_url: string;
    number: number;
    body: string;
    state: 'closed'|'open';
    assets: GiteaAsset[];
}

interface GiteaComment {
    user: {username: string};
    body: string;
    issue_url: string;
}

interface GiteaAsset {
    browser_download_url: string;
    name: string;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const env = await load();

const giteaRepoUrl: string = env['GITEA_REPO_URL'];
const giteaApiKey: string = env['GITEA_TOKEN'];

const githubIssueApiUrl: string = env['GITHUB_ISSUE_API_URL'];
const githubApiKey: string = env['GITHUB_API_KEY'];

const allGiteaIssues = async () => {
    const issues = [];
    let pageIssues = [];
    let page = 1;

    do {
        pageIssues = await giteaIssuesForPage(page);
        issues.push(...pageIssues);

        page++;
    } while(pageIssues.length !== 0);

    return issues.sort((a, b) => a.number - b.number);
};

const giteaIssuesForPage = async (page: number) => {
    const response = await fetch(`${giteaRepoUrl}/issues?page=${page}&state=all`, {
        headers: {
            'Accept': 'application/json',
            'Authorization': `token ${giteaApiKey}`,
            'Content-type': 'application/json',
        },
    });

    if (! response.ok) {
        throw new Error(response.toString());
    }

    return await response.json();
};

const giteaComments = async (): Promise<GiteaComment[]> => {
    const comments = [];
    let pageComments = [];
    let page = 1;

    do {
        pageComments = await giteaCommentsForPage(page);
        comments.push(...pageComments);

        page++;
    } while(pageComments.length !== 0);

    return comments;
};

const giteaCommentsForPage = async (page: number): Promise<GiteaComment[]> => {
    const response = await fetch(`${giteaRepoUrl}/issues/comments?page=${page}`, {
        headers: {
            'Accept': 'application/json',
            'Authorization': `token ${giteaApiKey}`,
            'Content-type': 'application/json',
        },
    });

    if (! response.ok) {
        throw new Error(response.toString());
    }

    return await response.json();
};

const giteaCommentsForIssue = (issue: number, allComments: GiteaComment[]): GiteaComment[] => {
    return allComments.filter(s => Number(s.issue_url.match(/\/issues\/(\d+)/)?.pop()) === issue);
};

const createGitHubIssue = async (issue: GiteaIssue, allComments: GiteaComment[]) => {
    const githubHeaders = {
        'Accept': 'application/json',
        'Authorization': `Bearer ${githubApiKey}`,
        'X-GitHub-Api-Version': '2022-11-28',
        'Content-type': 'application/json',
    } as const;

    const checkResponse = await fetch(`${githubIssueApiUrl}/${issue.number}`, {
        headers: githubHeaders,
    })

    if (checkResponse.status === 200) {
        console.log(`Issue #${issue.number} already exists in GitHub. Skipping...`);

        return;
    }

    const issueBody = issue.body + '\r\n\r\n' + [
        `> *Imported from Gitea using magic(tm): ${issue.html_url}*`,
        `> Original Comments:`,
        giteaCommentsForIssue(issue.number, allComments)
            .map(s => `> - ${s.user.username}: ${s.body}`)
            .join('\r\n') || '> (none)',
    ].join('\r\n');

    const createResponse = await fetch(githubIssueApiUrl, {
        method: 'POST',
        headers: githubHeaders,
        body: JSON.stringify({
            title: issue.title,
            body: issueBody,
        }),
    });

    if (createResponse.status === 403 || createResponse.status === 429) {
        console.log('rate limit exceeded, waiting...');
        console.log((await createResponse.json())?.message);

        await sleep(3_000);

        await createGitHubIssue(issue, allComments);

        return;
    }

    const data = await createResponse.json();

    const githubIssueNumber = data.number;

    console.log(`Successfully copied issue #${issue.number} to GitHub as issue #${githubIssueNumber}.`);

    if (issue.state === 'closed') {
        const updateResponse = await fetch(`${githubIssueApiUrl}/${githubIssueNumber}`, {
            method: 'PATCH',
            headers: githubHeaders,
            body: JSON.stringify({
                state: 'closed',
            }),
        });

        if (! updateResponse.ok) {
            throw new Error(updateResponse.toString());
        }

        console.log(`Set issue #${issue.number} to closed`);
    }

    if (createResponse.headers.has('x-ratelimit-remaining')) {
        const ratelimitRemaining = createResponse.headers.get('x-ratelimit-remaining');

        console.log(`${ratelimitRemaining} requests remain before being ratelimited`);

        if (Number(ratelimitRemaining) < 10) {
            await sleep(10_000);
        }
    }
};

if (import.meta.main) {
    const giteaIssues = await allGiteaIssues();

    const allComments = await giteaComments();

    for (const giteaIssue of giteaIssues) {
        await createGitHubIssue(giteaIssue, allComments);
    }

    Deno.exit(0);
}
