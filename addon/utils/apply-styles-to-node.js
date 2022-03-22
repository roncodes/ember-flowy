import { camelize } from '@ember/string';

export default function applyStylesToNode(node, styles = {}) {
  const keys = Object.keys(styles);

  for (let i = 0; i < keys.length; i++) {
    const key = keys.objectAt(i);

    node.style[`${camelize(key)}`] = styles[key];
  }

  return node;
}
