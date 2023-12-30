# Gitea to GitHub Issue Migrator

This project migrates your Gitea issues to GitHub.

This project is written in typescript using Deno, because I'm tired of dealing
with typescript nonsense in Node.

> **NOTE:** This project only works if the GitHub repo has no issues.

# Instructions
- Copy the `.env.example` to `.env` and insert the required information
- Run `deno run -A main.ts`

# Questions

> Q: I get this error: "You have exceeded a secondary rate limit and have been temporarily blocked from content creation. Please retry your request again later. If you reach out to GitHub Support for help, please include the request ID [...]"

A: This is part of the normal operation. GitHub is not a fan of creating many issues at once.

# License

See LICENSE
