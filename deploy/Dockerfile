# Plugin carrier image: only holds the built plugin; an initContainer copies it into Headlamp's plugins dir.
# Build from repo root after `npm run plugin:build`:
#   docker build -f deploy/Dockerfile -t <registry>/headlamp-node-overview:0.1.0 .
FROM busybox:1.37
COPY packages/headlamp-node-overview/dist/main.js /plugins/headlamp-node-overview/main.js
COPY packages/headlamp-node-overview/package.json /plugins/headlamp-node-overview/package.json
