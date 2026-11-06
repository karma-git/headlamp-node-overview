import { registerRoute, registerSidebarEntry } from '@kinvolk/headlamp-plugin/lib';
import NodeOverview from './NodeOverview';

registerSidebarEntry({
  parent: null,
  name: 'node-overview',
  label: 'Node Overview',
  url: '/node-overview',
  icon: 'mdi:view-grid',
});

registerRoute({
  path: '/node-overview',
  sidebar: 'node-overview',
  name: 'node-overview',
  exact: true,
  component: NodeOverview,
});
