# headlamp-node-overview

[![Artifact Hub](https://img.shields.io/endpoint?url=https://artifacthub.io/badge/repository/headlamp-node-overview)](https://artifacthub.io/packages/search?repo=headlamp-node-overview)
[![CI](https://github.com/karma-git/headlamp-node-overview/actions/workflows/ci.yml/badge.svg)](https://github.com/karma-git/headlamp-node-overview/actions/workflows/ci.yml)

A fast overview of every node in a Kubernetes cluster and the pods running on it, as a [Headlamp](https://headlamp.dev) plugin and as a standalone page served by `kubectl proxy`. Nodes are drawn as cards with CPU/memory requests, limits and usage, and every pod is a square inside its node on a single canvas, so clusters with thousands of pods stay responsive.

## Features

- Nodes grouped by any node label (zone, instance type, node pool…); the label picker lists the labels that actually split nodes first.
- Per-node bars for CPU and memory requests or limits against allocatable, with a marker for actual usage from metrics-server. Bars turn yellow above 85% and red when overcommitted.
- Pods colored by status (running, not ready, pending, completed, failing, terminating) or by namespace; size pods equally or by their memory/CPU requests or limits.
- Search: free text over namespace/name, node, status and owner kind, plus `ns:`, `node:`, `status:`, `owner:`, `is:noreq` (missing CPU or memory requests) and `is:nolimit`. Tokens are ANDed; non-matching pods fade out.
- Tooltips with requests, limits and usage for pods and nodes; clicking a pod or node opens its Headlamp page.
- Effective requests are computed like the scheduler: containers plus sidecars, the largest init container, and pod overhead.

## Requirements

- RBAC to `list`/`watch` pods and nodes cluster-wide.
- Optional: [metrics-server](https://github.com/kubernetes-sigs/metrics-server) for usage markers (`list` on `nodes` and `pods` in `metrics.k8s.io`). Without it the map works and shows usage as n/a.

## Install

- **Headlamp Desktop**: open the Plugin Catalog, search for "Node Overview" and install.
- **In-cluster Headlamp**: add the plugin through the Helm chart's `pluginsManager` (see the [Headlamp docs](https://headlamp.dev/docs/latest/installation/in-cluster/)):

  ```yaml
  pluginsManager:
    enabled: true
    configContent: |
      plugins:
        - name: headlamp-node-overview
          source: https://artifacthub.io/packages/headlamp/headlamp-node-overview/headlamp-node-overview
  ```

  Alternatively build an image that carries the plugin and copy it in with an init container: see [deploy/Dockerfile](deploy/Dockerfile) and [deploy/headlamp-values.yaml](deploy/headlamp-values.yaml).

- **Manually**: download `headlamp-node-overview-<version>.tar.gz` from the [releases](https://github.com/karma-git/headlamp-node-overview/releases) and extract it into the Headlamp plugins directory (`~/.config/Headlamp/plugins` on Linux, `~/Library/Application Support/Headlamp/plugins` on macOS, `%APPDATA%\Headlamp\Config\plugins` on Windows).

## Standalone app

The same map without Headlamp, served next to the Kubernetes API by `kubectl proxy`. It also keeps the search and view options in the URL hash, so views can be bookmarked.

```sh
npm install
npm run serve   # builds and runs kubectl proxy on http://127.0.0.1:8001/ui/
```

For development, run `kubectl proxy --port=8001` and `npm run dev`; Vite proxies `/api` and `/apis` to it.

## Repository layout

| Path                         | What                                                                  |
| ---------------------------- | --------------------------------------------------------------------- |
| `packages/core`              | Framework-free conversion, layout, filtering and canvas rendering     |
| `packages/headlamp-node-overview`  | The Headlamp plugin                                                   |
| `packages/app`               | The standalone app (list/watch over `kubectl proxy`)                  |
| `deploy`                     | Plugin carrier image and example Headlamp Helm values                 |

## Development

```sh
npm install
npm test               # core unit tests
npm run plugin:start   # watch mode, a running Headlamp picks the plugin up
npm run plugin:lint
npm run plugin:tsc
npm run plugin:build
```

## Releasing

Publish a GitHub release with a `vX.Y.Z` tag. The `release` workflow builds the plugin from the tag, attaches the tarball to the release and commits the new version and checksum in `artifacthub-pkg.yml` to `main`; Artifact Hub picks it up from there.

## License

[Apache-2.0](LICENSE)
