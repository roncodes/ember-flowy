import applyStylesToNode from './apply-styles-to-node';
import { dasherize } from '@ember/string';

export default function createNode(
  type,
  attributes = {},
  styles = {},
  children = []
) {
  const node = document.createElement(type);
  const attributeKeys = Object.keys(attributes);

  for (let i = 0; i < attributeKeys.length; i++) {
    const attrKey = attributeKeys.objectAt(i);
    const attrValue = attributes[attrKey];

    node.setAttribute(dasherize(attrKey), attrValue);
  }

  for (let i = 0; i < children.length; i++) {
    const childNode = children.objectAt(i);
    node.appendChild(childNode);
  }

  return applyStylesToNode(node, styles);
}
