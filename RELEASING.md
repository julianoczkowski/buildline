# Releasing

Releases are published to npm by GitHub Actions when a version tag is pushed. Nobody publishes from a laptop, and no npm token is stored in the repo: [`release.yml`](.github/workflows/release.yml) uses npm trusted publishing.

## Cutting a release

1. Describe the changes under a `## Unreleased` heading at the top of [`CHANGELOG.md`](CHANGELOG.md) and commit.
2. Run:

   ```bash
   npm run release -- patch      # or minor, major, or an exact version such as 0.4.0
   ```

   This runs the tests, bumps `package.json`, renames `## Unreleased` to the new version and date, commits, tags `vX.Y.Z`, and pushes.
3. The [release workflow](https://github.com/julianoczkowski/buildline/actions/workflows/release.yml) then tests again, checks the tag matches `package.json`, publishes to npm with provenance, and creates a GitHub release from the changelog section.

## One-time setup

On [npmjs.com](https://www.npmjs.com/package/buildline/access), open the package's **Settings**, find **Trusted publisher**, choose **GitHub Actions**, and enter:

| Field | Value |
|---|---|
| Organization or user | `julianoczkowski` |
| Repository | `buildline` |
| Workflow filename | `release.yml` |

## The docs site

[`pages.yml`](.github/workflows/pages.yml) rebuilds https://julianoczkowski.github.io/buildline/ whenever `docs/`, `site/` or the build script change on `main`. To preview it locally:

```bash
npm run site && npx serve _site
```

A new page in `docs/` has to be added to `NAV` in [`scripts/build-site.mjs`](scripts/build-site.mjs). The build fails if one is missing.
