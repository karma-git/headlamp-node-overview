import { registerRoute, registerSidebarEntry } from '@kinvolk/headlamp-plugin/lib';
import PodMap from './PodMap';

registerSidebarEntry({
  parent: null,
  name: 'pod-map',
  label: 'Pod Map',
  url: '/pod-map',
  icon: 'mdi:view-grid',
});

registerRoute({
  path: '/pod-map',
  sidebar: 'pod-map',
  name: 'pod-map',
  exact: true,
  component: PodMap,
});
