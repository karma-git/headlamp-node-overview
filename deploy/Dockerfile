# Plugin carrier image: only holds the built plugin; an initContainer copies it into Headlamp's plugins dir.
# Build from repo root after `npm run plugin:build`:
#   docker build -f deploy/Dockerfile -t <registry>/headlamp-pod-map:0.1.0 .
FROM busybox:1.37
COPY packages/headlamp-pod-map/dist/main.js /plugins/headlamp-pod-map/main.js
COPY packages/headlamp-pod-map/package.json /plugins/headlamp-pod-map/package.json
